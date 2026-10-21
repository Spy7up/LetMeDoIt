package net.lab1024.sa.app.module.task.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import net.lab1024.sa.app.module.task.domain.form.TaskActionForm;
import net.lab1024.sa.app.module.task.domain.form.TaskAddForm;
import net.lab1024.sa.app.module.task.domain.form.TaskCompleteForm;
import net.lab1024.sa.app.module.task.domain.form.TaskParticipantAddForm;
import net.lab1024.sa.app.module.task.domain.form.TaskQueryForm;
import net.lab1024.sa.app.module.task.domain.form.TaskRejectForm;
import net.lab1024.sa.app.module.task.domain.form.TaskUpdateForm;
import net.lab1024.sa.app.module.task.domain.vo.TaskDetailVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskListVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskStatsVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskSummaryVO;
import net.lab1024.sa.app.module.task.service.TaskService;
import net.lab1024.sa.app.util.AppRequestUtil;
import net.lab1024.sa.base.common.domain.PageResult;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 小程序 - 任务
 * <p>
 * 登录态由 AppInterceptor 统一校验，这里不再做 RBAC。
 *
 * @author letmedoit
 */
@RestController
@RequestMapping("/api/task")
@Tag(name = "小程序-任务")
public class TaskController {

    @Resource
    private TaskService taskService;

    @PostMapping("/query")
    @Operation(summary = "任务列表 @author letmedoit")
    public ResponseDTO<PageResult<TaskListVO>> query(@RequestBody @Valid TaskQueryForm queryForm) {
        return taskService.query(queryForm, AppRequestUtil.getMemberId());
    }

    @GetMapping("/get/{taskId}")
    @Operation(summary = "任务详情 @author letmedoit")
    public ResponseDTO<TaskDetailVO> detail(@PathVariable Long taskId) {
        return taskService.detail(taskId, AppRequestUtil.getMemberId());
    }

    @GetMapping("/summary")
    @Operation(summary = "首页摘要 @author letmedoit")
    public ResponseDTO<TaskSummaryVO> summary() {
        return taskService.summary(AppRequestUtil.getMemberId());
    }

    @GetMapping("/stats")
    @Operation(summary = "我的统计 @author letmedoit")
    public ResponseDTO<TaskStatsVO> stats() {
        return taskService.stats(AppRequestUtil.getMemberId());
    }

    @PostMapping("/add")
    @Operation(summary = "布置任务 @author letmedoit")
    public ResponseDTO<TaskDetailVO> add(@RequestBody @Valid TaskAddForm addForm) {
        return taskService.create(addForm, AppRequestUtil.getMemberId());
    }

    @PostMapping("/update")
    @Operation(summary = "编辑任务 @author letmedoit")
    public ResponseDTO<TaskDetailVO> update(@RequestBody @Valid TaskUpdateForm updateForm) {
        return taskService.update(updateForm, AppRequestUtil.getMemberId());
    }

    @PostMapping("/accept")
    @Operation(summary = "接受任务 @author letmedoit")
    public ResponseDTO<TaskDetailVO> accept(@RequestBody @Valid TaskActionForm form) {
        return taskService.accept(form.getTaskId(), AppRequestUtil.getMemberId());
    }

    @PostMapping("/reject")
    @Operation(summary = "拒绝任务 @author letmedoit")
    public ResponseDTO<TaskDetailVO> reject(@RequestBody @Valid TaskRejectForm form) {
        return taskService.reject(form, AppRequestUtil.getMemberId());
    }

    @PostMapping("/complete")
    @Operation(summary = "完成我这份 @author letmedoit")
    public ResponseDTO<TaskDetailVO> complete(@RequestBody @Valid TaskCompleteForm form) {
        return taskService.complete(form, AppRequestUtil.getMemberId());
    }

    @PostMapping("/cancel")
    @Operation(summary = "撤回任务 @author letmedoit")
    public ResponseDTO<TaskDetailVO> cancel(@RequestBody @Valid TaskActionForm form) {
        return taskService.cancel(form.getTaskId(), AppRequestUtil.getMemberId());
    }

    @PostMapping("/remind")
    @Operation(summary = "催一下 @author letmedoit")
    public ResponseDTO<TaskDetailVO> remind(@RequestBody @Valid TaskActionForm form) {
        return taskService.remind(form.getTaskId(), AppRequestUtil.getMemberId());
    }

    @PostMapping("/participant/add")
    @Operation(summary = "追加参与者 @author letmedoit")
    public ResponseDTO<TaskDetailVO> addParticipant(@RequestBody @Valid TaskParticipantAddForm form) {
        return taskService.addParticipants(form, AppRequestUtil.getMemberId());
    }
}
