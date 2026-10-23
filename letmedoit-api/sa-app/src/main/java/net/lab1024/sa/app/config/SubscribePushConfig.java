package net.lab1024.sa.app.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 订阅消息推送线程池
 * <p>
 * 为什么要独立线程池：一条任务通知可能要发给 10 个参与者，每人一次 HTTP 调用，
 * 单次超时 5 秒，最坏 50 秒。这个活绝不能挂在请求线程或事务里。
 * <p>
 * 队列满时的策略是**直接丢弃 + 打日志**，不使用 CallerRunsPolicy：
 * 订阅消息本身是不可靠通道（用户可能没授权），站内通知才是事实来源，
 * 宁可少发一条卡片，也不能反向阻塞业务。
 *
 * @author letmedoit
 */
@Slf4j
@Configuration
public class SubscribePushConfig {

    /**
     * 线程池 bean 名称
     */
    public static final String EXECUTOR = "subscribePushExecutor";

    /**
     * 单批最多推送多少条，超出部分只落站内通知，避免定时作业一轮打出上千次微信调用（45009）
     */
    public static final int MAX_PUSH_PER_BATCH = 50;

    @Bean(name = EXECUTOR)
    public ThreadPoolTaskExecutor subscribePushExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("subscribe-push-");
        executor.setRejectedExecutionHandler((runnable, pool) ->
                log.warn("订阅消息推送队列已满，本条丢弃；站内通知仍可在消息中心查看"));
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.initialize();
        return executor;
    }
}
