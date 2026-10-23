package net.lab1024.sa.app.module.file.service;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.module.member.domain.RequestMember;
import net.lab1024.sa.app.util.AppRequestUtil;
import net.lab1024.sa.base.common.code.UserErrorCode;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import net.lab1024.sa.base.module.support.file.constant.FileFolderTypeEnum;
import net.lab1024.sa.base.module.support.file.dao.FileDao;
import net.lab1024.sa.base.module.support.file.domain.entity.FileEntity;
import net.lab1024.sa.base.module.support.file.domain.vo.FileUploadVO;
import net.lab1024.sa.base.module.support.file.service.IFileStorageService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * 小程序文件上传
 * <p>
 * 复用 sa-base 的 IFileStorageService（S3 兼容，七牛 Kodo / OSS / MinIO 都能用），
 * 但**不使用** FileService.fileUpload：那个方法把路径固定成 private/xxx，
 * 会走私有读 + 预签名 URL（1 小时过期），小程序头像、任务凭证图需要长期可访问，
 * 所以这里自己指定 public/app/ 前缀，拿到的是公共读的稳定 URL。
 * <p>
 * 上传成功会写一条 t_file 台账，后台「文件管理」能看到，方便排查和清理。
 *
 * @author letmedoit
 */
@Slf4j
@Service
public class AppFileService {

    /**
     * 单文件大小上限：微信侧压缩后一般在 1MB 内，10MB 足够兜底
     */
    private static final long MAX_SIZE = 10 * 1024 * 1024L;

    /**
     * 允许的图片后缀
     */
    private static final List<String> ALLOWED_EXT = Arrays.asList("jpg", "jpeg", "png", "webp", "gif");

    /**
     * 公共读前缀：必须包含 sa-base 约定的 public，才会：
     * 1. 上传时 ACL 设为 public-read；
     * 2. 返回 cloud.public-url-prefix + fileKey 的稳定 URL（不会过期）。
     */
    private static final String PUBLIC_ROOT = FileFolderTypeEnum.FOLDER_PUBLIC + "/app/";

    @Resource
    private IFileStorageService fileStorageService;

    @Resource
    private FileDao fileDao;

    /**
     * 上传图片
     *
     * @param file    上传的文件
     * @param bizType 业务类型：avatar / task-image / 其他走 common
     */
    public ResponseDTO<FileUploadVO> uploadImage(MultipartFile file, String bizType) {
        RequestMember member = AppRequestUtil.getMember();
        if (member == null) {
            return ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID);
        }
        if (file == null || file.isEmpty()) {
            return ResponseDTO.userErrorParam("文件是空的");
        }
        if (file.getSize() > MAX_SIZE) {
            return ResponseDTO.userErrorParam("图片不能超过 10MB");
        }
        String originalFilename = file.getOriginalFilename();
        String ext = StringUtils.getFilenameExtension(originalFilename);
        if (!StringUtils.hasText(ext)) {
            return ResponseDTO.userErrorParam("认不出文件格式，换一张试试");
        }
        ext = ext.toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXT.contains(ext)) {
            return ResponseDTO.userErrorParam("只支持 jpg / png / webp / gif");
        }

        String path = PUBLIC_ROOT + folderOf(bizType) + "/";
        ResponseDTO<FileUploadVO> response;
        try {
            response = fileStorageService.upload(file, path);
        } catch (Exception e) {
            // S3 SDK 抛的是 unchecked，不能让它冒到全局异常处理器变成「系统错误」
            log.error("文件上传异常, bizType={}, fileName={}", bizType, originalFilename, e);
            return ResponseDTO.userErrorParam("上传失败了，请稍后重试");
        }
        if (!response.getOk() || response.getData() == null) {
            log.error("文件上传失败, bizType={}, fileName={}, msg={}", bizType, originalFilename,
                    response.getMsg());
            return ResponseDTO.error(response);
        }

        FileUploadVO vo = response.getData();
        // 容错：public-url-prefix 少写一个斜杠会拼出 //，这里统一收敛
        vo.setFileUrl(normalizeUrl(vo.getFileUrl()));

        // 台账：folderType 只能挂 sa-base 现成的枚举值，路径已由上面的 PUBLIC_ROOT 决定
        FileEntity entity = new FileEntity();
        entity.setFolderType(FileFolderTypeEnum.COMMON.getValue());
        entity.setFileName(originalFilename);
        entity.setFileSize(file.getSize());
        entity.setFileKey(vo.getFileKey());
        entity.setFileType(vo.getFileType());
        entity.setCreatorId(member.getUserId());
        entity.setCreatorName(member.getUserName());
        entity.setCreatorUserType(member.getUserType().getValue());
        fileDao.insert(entity);
        vo.setFileId(entity.getFileId());

        return ResponseDTO.ok(vo);
    }

    /**
     * 业务类型 → 目录，限制在白名单里，避免被外部塞任意路径
     */
    private String folderOf(String bizType) {
        if ("avatar".equalsIgnoreCase(bizType)) {
            return "avatar";
        }
        if ("task-image".equalsIgnoreCase(bizType)) {
            return "task-image";
        }
        return "common";
    }

    /**
     * 把 URL 里协议之后的多余斜杠合并成一个
     */
    private String normalizeUrl(String url) {
        if (!StringUtils.hasText(url)) {
            return url;
        }
        int schemeIndex = url.indexOf("://");
        if (schemeIndex < 0) {
            return url;
        }
        String scheme = url.substring(0, schemeIndex + 3);
        String rest = url.substring(schemeIndex + 3).replaceAll("/{2,}", "/");
        return scheme + rest;
    }
}
