package net.lab1024.sa.app.module.task.job;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.app.module.member.service.WxMemberService;
import net.lab1024.sa.app.module.task.constant.ParticipantStatusEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;
import net.lab1024.sa.app.module.task.dao.TaskDao;
import net.lab1024.sa.app.module.task.dao.TaskParticipantDao;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import net.lab1024.sa.app.module.task.domain.entity.TaskParticipantEntity;
import net.lab1024.sa.app.module.task.manager.TaskManager;
import net.lab1024.sa.app.module.task.service.TaskNoticeService;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 任务定时作业
 * <p>
 * 每分钟做两件事：
 * 1. 预约任务到点 → 转为待接受
 * 2. 到提醒时间的任务 → 给还没完成的人写提醒通知
 * <p>
 * 多实例部署时用 Redisson 锁保证只有一个实例执行；锁租期短于调度间隔，
 * 进程被 kill 也能在下一分钟自动恢复。
 *
 * @author letmedoit
 */
@Slf4j
@Component
public class TaskScheduleJob {

    /**
     * 作业分布式锁，key 集中在 AppRedisKeyConst 管理更规范，这里为局部作业单独定义
     */
    private static final String LOCK_KEY = "app:task:schedule:job:lock";

    /**
     * 单轮最多处理多少条，避免一次拉起太多
     */
    private static final int BATCH_SIZE = 100;

    @Resource
    private RedissonClient redissonClient;

    @Resource
    private TaskDao taskDao;

    @Resource
    private TaskParticipantDao taskParticipantDao;

    @Resource
    private TaskManager taskManager;

    @Resource
    private TaskNoticeService taskNoticeService;

    @Resource
    private WxMemberService wxMemberService;

    @Scheduled(cron = "0 * * * * ?")
    public void run() {
        RLock lock = redissonClient.getLock(LOCK_KEY);
        boolean locked = false;
        try {
            locked = lock.tryLock(0, 50, TimeUnit.SECONDS);
            if (!locked) {
                return;
            }
            activateScheduledTasks();
            sendDueReminders();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.error("任务定时作业异常", e);
        } finally {
            if (locked && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * 预约任务到点生效
     */
    private void activateScheduledTasks() {
        List<TaskEntity> tasks = taskDao.queryScheduledToActivate(LocalDateTime.now(),
                TaskStatusEnum.SCHEDULED.getValue(), BATCH_SIZE);
        if (CollectionUtils.isEmpty(tasks)) {
            return;
        }
        for (TaskEntity task : tasks) {
            try {
                taskManager.activate(task);
            } catch (Exception e) {
                log.error("预约任务生效失败, taskId={}", task.getTaskId(), e);
            }
        }
        log.info("预约任务生效 {} 条", tasks.size());
    }

    /**
     * 到期提醒：只发给还没完成的人，发完清空 remind_time 避免重复
     */
    private void sendDueReminders() {
        LocalDateTime now = LocalDateTime.now();
        List<TaskEntity> tasks = taskDao.queryRemindList(now, Boolean.FALSE, BATCH_SIZE);
        if (CollectionUtils.isEmpty(tasks)) {
            return;
        }

        List<Long> taskIds = tasks.stream().map(TaskEntity::getTaskId).collect(Collectors.toList());
        Map<Long, List<TaskParticipantEntity>> participantMap = taskParticipantDao
                .queryEntityByTaskIds(taskIds, Boolean.FALSE)
                .stream()
                .collect(Collectors.groupingBy(TaskParticipantEntity::getTaskId));

        List<Long> creatorIds = tasks.stream().map(TaskEntity::getCreatorId).distinct().collect(Collectors.toList());
        Map<Long, WxMemberEntity> creatorMap = wxMemberService.queryByIds(creatorIds).stream()
                .collect(Collectors.toMap(WxMemberEntity::getMemberId, item -> item));

        int sent = 0;
        for (TaskEntity task : tasks) {
            try {
                List<Long> waiting = participantMap.getOrDefault(task.getTaskId(), List.of())
                        .stream()
                        .filter(p -> TaskManager.ACTIONABLE_PARTICIPANT_STATUS.contains(p.getStatus()))
                        .map(TaskParticipantEntity::getMemberId)
                        .collect(Collectors.toList());
                if (!waiting.isEmpty()) {
                    WxMemberEntity creator = creatorMap.get(task.getCreatorId());
                    String creatorName = creator == null || !StringUtils.hasText(creator.getNickname())
                            ? "有人" : creator.getNickname();
                    taskNoticeService.notifyRemind(task, creatorName, waiting);
                    sent++;
                }
                // 无论有没有收件人，都清空提醒时间，避免每分钟重复扫描
                taskDao.updateRemind(task.getTaskId(), null, null, now);
            } catch (Exception e) {
                log.error("任务提醒下发失败, taskId={}", task.getTaskId(), e);
            }
        }
        if (sent > 0) {
            log.info("任务到期提醒下发 {} 条", sent);
        }
    }
}
