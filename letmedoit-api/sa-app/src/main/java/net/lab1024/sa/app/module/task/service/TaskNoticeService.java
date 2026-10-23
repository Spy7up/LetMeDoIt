package net.lab1024.sa.app.module.task.service;

import com.alibaba.fastjson.JSON;
import jakarta.annotation.Resource;
import net.lab1024.sa.app.module.dict.constant.AppDictCode;
import net.lab1024.sa.app.module.dict.service.AppDictService;
import net.lab1024.sa.app.module.notice.constant.NoticeTemplateEnum;
import net.lab1024.sa.app.module.notice.dao.NoticeDao;
import net.lab1024.sa.app.module.notice.domain.entity.NoticeEntity;
import net.lab1024.sa.app.module.notice.domain.vo.NoticeVO;
import net.lab1024.sa.app.module.subscribe.service.WxSubscribePusher;
import net.lab1024.sa.app.module.task.constant.CompletionModeEnum;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 任务相关通知的生成
 * <p>
 * 只负责「写通知表」，投递交给 WxSubscribePusher：t_task_notice 是小程序内消息中心的事实来源，
 * 微信订阅消息从这张表取内容投递，内容与投递解耦。
 * <p>
 * 字段顺序与《产品与技术方案》§7.2 的模板关键词一一对应，第一个永远是任务名称。
 *
 * @author letmedoit
 */
@Service
public class TaskNoticeService {

    /**
     * 微信 time 类型字段的推荐格式
     */
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /**
     * 单条通知最多 4 行，与微信订阅消息关键词数量对齐
     */
    private static final int MAX_FIELDS = 4;

    @Resource
    private NoticeDao noticeDao;

    @Resource
    private WxSubscribePusher subscribePusher;

    @Resource
    private AppDictService appDictService;

    /**
     * 任务委托通知：发给每个参与者
     *
     * @param task           任务
     * @param creatorName    委托人昵称
     * @param participantIds 接收人（不含委托人自己）
     * @param totalCount     参与者总数，用于展示「共 N 人」
     */
    public void notifyAssigned(TaskEntity task, String creatorName, List<Long> participantIds, int totalCount) {
        if (CollectionUtils.isEmpty(participantIds)) {
            return;
        }
        CompletionModeEnum mode = CompletionModeEnum.ALL.getValue().equals(task.getCompletionMode())
                ? CompletionModeEnum.ALL : CompletionModeEnum.ANY;
        // 文案走数据字典 TASK_COMPLETION_MODE；通知内容落库后不再变，改字典只影响新通知
        String modeText = appDictService.label(AppDictCode.TASK_COMPLETION_MODE, mode);
        List<NoticeVO.Field> fields = Arrays.asList(
                new NoticeVO.Field("任务名称", task.getTitle()),
                new NoticeVO.Field("委托人", creatorName),
                new NoticeVO.Field("参与人数", "共 " + totalCount + " 人（" + modeText + "）"),
                new NoticeVO.Field("截止时间", formatTime(task.getDeadline()))
        );
        insertBatch(participantIds, task.getTaskId(), NoticeTemplateEnum.TASK_ASSIGNED, fields);
    }

    /**
     * 任务完成通知：发给委托人
     *
     * @param task          任务
     * @param completerName 完成人昵称
     * @param creatorId     收件人（委托人）
     * @param doneCount     已完成人数
     * @param totalCount    参与总人数
     * @param allDone       是否整单结束
     */
    public void notifyCompleted(TaskEntity task, String completerName, Long creatorId,
                                int doneCount, int totalCount, boolean allDone) {
        NoticeTemplateEnum template = allDone ? NoticeTemplateEnum.TASK_ALL_DONE : NoticeTemplateEnum.TASK_COMPLETED;
        List<NoticeVO.Field> fields = allDone
                ? Arrays.asList(
                        new NoticeVO.Field("任务名称", task.getTitle()),
                        new NoticeVO.Field("最后完成人", completerName),
                        new NoticeVO.Field("完成时间", formatTime(LocalDateTime.now())),
                        new NoticeVO.Field("完成情况", "全员完成 " + totalCount + "/" + totalCount))
                : Arrays.asList(
                        new NoticeVO.Field("任务名称", task.getTitle()),
                        new NoticeVO.Field("完成人", completerName),
                        new NoticeVO.Field("完成时间", formatTime(LocalDateTime.now())),
                        new NoticeVO.Field("完成进度", doneCount + "/" + totalCount + " 人已完成"));
        insertBatch(Arrays.asList(creatorId), task.getTaskId(), template, fields);
    }

    /**
     * 到期提醒：只发给还没完成的人
     *
     * @param task        任务
     * @param creatorName 委托人昵称
     * @param memberIds   接收人
     */
    public void notifyRemind(TaskEntity task, String creatorName, List<Long> memberIds) {
        if (CollectionUtils.isEmpty(memberIds)) {
            return;
        }
        List<NoticeVO.Field> fields = Arrays.asList(
                new NoticeVO.Field("任务名称", task.getTitle()),
                new NoticeVO.Field("委托人", creatorName),
                new NoticeVO.Field("截止时间", formatTime(task.getDeadline())),
                new NoticeVO.Field("提示", "对方在等你了")
        );
        insertBatch(memberIds, task.getTaskId(), NoticeTemplateEnum.TASK_REMIND, fields);
    }

    /**
     * 开始时间点到点通知：任务正式生效，提醒参与者可以动手了
     */
    public void notifyStarted(TaskEntity task, String creatorName, List<Long> memberIds) {
        if (CollectionUtils.isEmpty(memberIds)) {
            return;
        }
        List<NoticeVO.Field> fields = Arrays.asList(
                new NoticeVO.Field("任务名称", task.getTitle()),
                new NoticeVO.Field("委托人", creatorName),
                new NoticeVO.Field("开始时间", formatTime(task.getStartTime())),
                new NoticeVO.Field("提示", "现在可以开始做了")
        );
        insertBatch(memberIds, task.getTaskId(), NoticeTemplateEnum.TASK_START, fields);
    }

    /**
     * 任务被改过：通知全部参与者（含已经做完的人，他们的记录也受影响）
     */
    public void notifyEdited(TaskEntity task, String creatorName, List<Long> memberIds) {
        if (CollectionUtils.isEmpty(memberIds)) {
            return;
        }
        List<NoticeVO.Field> fields = Arrays.asList(
                new NoticeVO.Field("任务名称", task.getTitle()),
                new NoticeVO.Field("委托人", creatorName),
                new NoticeVO.Field("截止时间", formatTime(task.getDeadline())),
                new NoticeVO.Field("提示", "你收到的任务有改动，看一眼")
        );
        insertBatch(memberIds, task.getTaskId(), NoticeTemplateEnum.TASK_EDITED, fields);
    }

    /**
     * 任务被撤回：通知全部参与者（含已做完的人，他们那份也不用交了）
     */
    public void notifyCancelled(TaskEntity task, String creatorName, List<Long> memberIds) {
        if (CollectionUtils.isEmpty(memberIds)) {
            return;
        }
        List<NoticeVO.Field> fields = Arrays.asList(
                new NoticeVO.Field("任务名称", task.getTitle()),
                new NoticeVO.Field("委托人", creatorName),
                new NoticeVO.Field("撤回时间", formatTime(LocalDateTime.now())),
                new NoticeVO.Field("提示", "委托人撤回了这条任务，不用再做了")
        );
        insertBatch(memberIds, task.getTaskId(), NoticeTemplateEnum.TASK_CANCELLED, fields);
    }

    private void insertBatch(List<Long> memberIds, Long taskId, NoticeTemplateEnum template, List<NoticeVO.Field> fields) {
        List<NoticeVO.Field> limited = fields.size() > MAX_FIELDS ? fields.subList(0, MAX_FIELDS) : fields;
        String fieldsJson = JSON.toJSONString(limited);
        LocalDateTime now = LocalDateTime.now();
        List<NoticeEntity> list = new ArrayList<>(memberIds.size());
        for (Long memberId : memberIds) {
            NoticeEntity entity = new NoticeEntity();
            entity.setMemberId(memberId);
            entity.setTaskId(taskId);
            entity.setTemplateKey(template.getKey());
            entity.setTitle(template.getTitle());
            entity.setFieldsJson(fieldsJson);
            entity.setReadFlag(Boolean.FALSE);
            entity.setDeletedFlag(Boolean.FALSE);
            entity.setCreateTime(now);
            entity.setUpdateTime(now);
            list.add(entity);
        }
        noticeDao.insertBatch(list);
        pushAfterCommit(list);
    }

    /**
     * 事务提交后再推订阅消息
     * <p>
     * 1. 不能在事务里做 HTTP：一个 10 人任务就是 10 次调用、单次超时 5s，最坏 50 秒卡死连接池；
     * 2. 事务回滚时不能发出「不存在的任务」通知；
     * 3. 推送本身在独立线程池里串行执行，失败只打日志，站内通知照常可看。
     */
    private void pushAfterCommit(List<NoticeEntity> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    subscribePusher.pushAsync(list);
                }
            });
            return;
        }
        subscribePusher.pushAsync(list);
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? "-" : TIME_FORMATTER.format(time);
    }
}
