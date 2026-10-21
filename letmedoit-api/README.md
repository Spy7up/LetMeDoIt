# letmedoit-api

「让我做」后端服务（SpringBoot）。

> 当前为占位目录，代码待建。接口契约见
> `../letmedoit-miniprogram/docs/让我做-v1.1-产品与技术方案.md` 第 6 章。

## 计划中的目录结构

```
letmedoit-api/
├── pom.xml
└── src/main/
    ├── java/xxx/letmedoit/
    │   ├── LetmedoitApplication.java
    │   ├── controller/      # auth / friend / task / notice
    │   ├── service/
    │   ├── mapper/          # MyBatis
    │   └── config/
    └── resources/
        └── application.yml
```

## 注意

小程序端 `miniprogram/mock/db.js` 中的 `aggregate()` 是任务聚合状态的唯一判定逻辑，
后端实现时需写一份等价实现，保证两端状态一致。
