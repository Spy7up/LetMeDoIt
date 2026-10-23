package net.lab1024.sa.app.module.file.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import net.lab1024.sa.app.module.file.service.AppFileService;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import net.lab1024.sa.base.module.support.file.domain.vo.FileUploadVO;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 小程序 - 文件上传
 * <p>
 * 路径放在 /api 下，才能被 AppInterceptor 拦到（sa-base 自带的 /file/upload 不在
 * /api/** 里，小程序端不带 token 也能调，这里不能用它）。
 *
 * @author letmedoit
 */
@RestController
@RequestMapping("/api/file")
@Tag(name = "小程序-文件上传")
public class AppFileController {

    @Resource
    private AppFileService appFileService;

    @PostMapping("/upload")
    @Operation(summary = "上传图片（头像 / 任务凭证图） @author letmedoit")
    public ResponseDTO<FileUploadVO> upload(@RequestParam("file") MultipartFile file,
                                            @RequestParam(value = "bizType", required = false) String bizType) {
        return appFileService.uploadImage(file, bizType);
    }
}
