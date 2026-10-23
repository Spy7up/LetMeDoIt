package net.lab1024.sa.app.module.dict.constant;

/**
 * sa-app 使用的数据字典编码
 * <p>
 * 与 sa-base 的 t_dict.dict_code 一一对应，初始化脚本见 docs/sql/letmedoit_dict.sql。
 * 展示文案（statusDesc / completionModeDesc / eventTypeDesc）一律从这里取，
 * 不要在 Java 里再写死中文。
 *
 * @author letmedoit
 */
public class AppDictCode {

    /**
     * 任务聚合状态（t_task.status）
     */
    public static final String TASK_STATUS = "TASK_STATUS";

    /**
     * 参与者在任务里的状态（t_task_participant.status）
     */
    public static final String TASK_PARTICIPANT_STATUS = "TASK_PARTICIPANT_STATUS";

    /**
     * 任务完成条件（t_task.completion_mode）
     */
    public static final String TASK_COMPLETION_MODE = "TASK_COMPLETION_MODE";

    /**
     * 任务事件类型（t_task_event.event_type）
     */
    public static final String TASK_EVENT_TYPE = "TASK_EVENT_TYPE";

    private AppDictCode() {
    }
}
