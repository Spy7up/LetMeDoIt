package net.lab1024.sa.app.module.task.job;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.app.module.member.service.WxMemberService;
import net.lab1024.sa.app.module.notice.constant.NoticeTemplateEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;
import net.lab1024.sa.app.module.task.dao.TaskDao;
import net.lab1024.sa.app.module.task.dao.TaskParticipantDao;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import net.lab1024.sa.app.module.task.domain.entity.TaskParticipantEntity;
import net.lab1024.sa.app.module.task.manager.TaskManager;
import net.lab1024.sa.app.module.task.service.TaskNoticeService;
import net.lab1024.sa.base.module.support.job.core.SmartJob;
import net.lab1024.sa.base.module.support.job.repository.SmartJobDao;
import net.lab1024.sa.base.module.support.job.repository.domain.SmartJobEntity;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 任务定时作业（SmartJob 实现）
 * <p>
 * 每轮做两件事：
 * 1. 预约任务到点 → 转为待接受
 * 2. 到提醒时间的任务 → 给还没完成的人写提醒通知
 * <p>
 * 调度交给 sa-base 的 SmartJob：配置在 t_smart_job（job_class = 本类全限定名，
 * trigger_type = cron，trigger_value = 0 * * * * *），可在后台「系统工具-定时任务」
 * 启停、改 cron、看执行日志。集群下 SmartJobExecutor 自带 Redisson 执行锁 +
 * lastExecuteTime 校验，多实例也只有一个跑，所以这里不再自己加锁。
 *
 * @author letmedoit
 */
@Slf4j
@Service
public class TaskScheduleJob implements SmartJob {

    /**
     * 单轮最多处理多少条，避免一次拉起太多
     */
    private static final int BATCH_SIZE = 100;

    /**
     * 逾期扫描的时间窗口（小时）
     * <p>
     * 只处理这么长时间内逾期的任务：既保证及时，也避免首次上线时
     * 把历史老任务一次性全部补发通知。
     */
    private static final int OVERDUE_WINDOW_HOURS = 24;

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

    @Resource
    private SmartJobDao smartJobDao;

    /**
     * 启动自检：没在 t_smart_job 注册就等于不会执行，必须让它响一声
     * <p>
     * SmartJob 是「配置驱动」的，代码里没有 @Scheduled 兜底。漏执行初始化 SQL 时
     * 任务会静默不跑（提醒功能整体失效），所以这里在启动完成后查一次配置表并打错误日志。
     * 只读，不写库，不改变运维在后台做的任何配置。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void checkRegistered() {
        try {
            List<SmartJobEntity> jobs = smartJobDao.selectList(null);
            boolean registered = jobs != null && jobs.stream().anyMatch(job ->
                    !Boolean.TRUE.equals(job.getDeletedFlag())
                            && TaskScheduleJob.class.getName().equals(job.getJobClass()));
            if (!registered) {
                log.error("【定时任务】{} 未在 t_smart_job 注册，预约生效与到期提醒不会执行！" +
                                "请执行 docs/sql/letmedoit_dict.sql（job_class 需与类全限定名一致）",
                        TaskScheduleJob.class.getName());
            }
        } catch (Exception e) {
            log.warn("【定时任务】启动自检失败，请人工确认 t_smart_job 是否已注册", e);
        }
    }

    /**
     * SmartJob 入口
     *
     * @param param 任务参数，本作业不需要
     * @return 执行结果，会写进 t_smart_job_log
     */
    @Override
    public String run(String param) {
        int activated = activateScheduledTasks();
        int reminded = sendDueReminders();
        int overdue = sendOverdueNotices();
        String result = "预约生效 " + activated + " 条，到期提醒 " + reminded + " 条，逾期提醒 " + overdue + " 条";
        log.info("TaskScheduleJob 执行完成：{}", result);
        return result;
    }

    /**
     * 预约任务到点生效
     *
     * @return 生效条数
     */
    private int activateScheduledTasks() {
        List<TaskEntity> tasks = taskDao.queryScheduledToActivate(LocalDateTime.now(),
                TaskStatusEnum.SCHEDULED.getValue(), BATCH_SIZE);
        if (CollectionUtils.isEmpty(tasks)) {
            return 0;
        }
        int activated = 0;
        for (TaskEntity task : tasks) {
            try {
                taskManager.activate(task);
                activated++;
                // 到点通知由委托人开关控制，默认开
                if (!Boolean.FALSE.equals(task.getStartNotifyFlag())) {
                    notifyStarted(task);
                }
            } catch (Exception e) {
                log.error("预约任务生效失败, taskId={}", task.getTaskId(), e);
            }
        }
        return activated;
    }

    /**
     * 开始时间点到点：给除委托人以外的参与者各发一条通知
     */
    private void notifyStarted(TaskEntity task) {
        List<Long> memberIds = taskParticipantDao.queryEntityByTaskId(task.getTaskId(), Boolean.FALSE)
                .stream()
                .map(TaskParticipantEntity::getMemberId)
                .filter(id -> !Objects.equals(id, task.getCreatorId()))
                .distinct()
                .collect(Collectors.toList());
        if (CollectionUtils.isEmpty(memberIds)) {
            return;
        }
        WxMemberEntity creator = wxMemberService.getById(task.getCreatorId());
        String name = creator == null || !StringUtils.hasText(creator.getNickname())
                ? "有人" : creator.getNickname();
        taskNoticeService.notifyStarted(task, name, memberIds);
    }

    /**
     * 到期提醒：只发给还没完成的人，发完清空 remind_time 避免重复
     *
     * @return 下发条数
     */
    private int sendDueReminders() {
        LocalDateTime now = LocalDateTime.now();
        List<TaskEntity> tasks = taskDao.queryRemindList(now, Boolean.FALSE, BATCH_SIZE);
        if (CollectionUtils.isEmpty(tasks)) {
            return 0;
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
                // 无论有没有收件人，都清空提醒时间，避免下轮重复扫描
                taskDao.updateRemind(task.getTaskId(), null, null, now);
            } catch (Exception e) {
                log.error("任务提醒下发失败, taskId={}", task.getTaskId(), e);
            }
        }
        return sent;
    }

    /**
     * 逾期提醒：过了截止时间但还没结束，通知委托人
     * <p>
     * 两个必须的约束：
     * 1. <b>每个任务只发一次</b> —— 作业每分钟跑一轮，不判重的话创建者会被刷屏；
     * 2. <b>只扫最近 24 小时逾期的</b> —— 否则第一次上线会把半年前的老任务一次性补发一遍。
     *
     * @return 下发条数
     */
    private int sendOverdueNotices() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime since = now.minusHours(OVERDUE_WINDOW_HOURS);
        List<TaskEntity> tasks = taskDao.queryOverdueList(since, now,
                TaskStatusEnum.IN_PROGRESS.getValue(), Boolean.FALSE, BATCH_SIZE);
        if (CollectionUtils.isEmpty(tasks)) {
            return 0;
        }

        List<Long> taskIds = tasks.stream().map(TaskEntity::getTaskId).collect(Collectors.toList());
        Map<Long, List<TaskParticipantEntity>> participantMap = taskParticipantDao
                .queryEntityByTaskIds(taskIds, Boolean.FALSE)
                .stream()
                .collect(Collectors.groupingBy(TaskParticipantEntity::getTaskId));

        int sent = 0;
        for (TaskEntity task : tasks) {
            try {
                if (taskNoticeService.hasNotified(task.getTaskId(), NoticeTemplateEnum.TASK_OVERDUE)) {
                    continue;
                }
                long waiting = participantMap.getOrDefault(task.getTaskId(), List.of())
                        .stream()
                        .filter(p -> TaskManager.ACTIONABLE_PARTICIPANT_STATUS.contains(p.getStatus()))
                        .count();
                // 其实都做完了、只是聚合状态还没翻，不该报逾期
                if (waiting <= 0) {
                    continue;
                }
                taskNoticeService.notifyOverdue(task, (int) waiting);
                sent++;
            } catch (Exception e) {
                log.error("逾期通知下发失败, taskId={}", task.getTaskId(), e);
            }
        }
        return sent;
    }
}
