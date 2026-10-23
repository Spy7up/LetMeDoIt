package net.lab1024.sa.app.module.task.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import net.lab1024.sa.app.module.task.domain.entity.TaskEventEntity;
import net.lab1024.sa.app.module.task.domain.vo.TaskEventVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 任务事件 DAO（append-only）
 *
 * @author letmedoit
 */
@Mapper
public interface TaskEventDao extends BaseMapper<TaskEventEntity> {

    /**
     * 查询任务的事件时间线（含操作人昵称头像）
     *
     * @param taskId 任务ID
     * @return 事件列表，按时间正序
     */
    List<TaskEventVO> queryByTaskId(@Param("taskId") Long taskId);
}
