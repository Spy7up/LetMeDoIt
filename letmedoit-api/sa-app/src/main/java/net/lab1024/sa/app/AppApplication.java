package net.lab1024.sa.app;

import net.lab1024.sa.base.listener.Ip2RegionListener;
import net.lab1024.sa.base.listener.LogVariableListener;
import org.apache.ibatis.annotations.Mapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 小程序端启动类
 * <p>
 * 仅加载 sa-base 通用能力 + sa-app 小程序业务，不加载 sa-admin 的任何代码
 *
 * @author smart-admin
 */
@EnableCaching
@EnableScheduling
@EnableAspectJAutoProxy(proxyTargetClass = true, exposeProxy = true)
@ComponentScan(AppApplication.COMPONENT_SCAN)
@MapperScan(value = AppApplication.COMPONENT_SCAN, annotationClass = Mapper.class)
@SpringBootApplication(exclude = {UserDetailsServiceAutoConfiguration.class})
public class AppApplication {

    public static final String COMPONENT_SCAN = "net.lab1024.sa";

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(AppApplication.class);
        // 添加 日志监听器，使 log4j2-spring.xml 可以间接读取到配置文件的属性
        application.addListeners(new LogVariableListener(), new Ip2RegionListener());
        application.run(args);
    }
}
