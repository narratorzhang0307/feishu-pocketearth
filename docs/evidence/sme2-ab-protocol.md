# Armv9 / SME2 同机 A/B 验收协议

## 目的

证明 MNN 在比赛目标手机上真实识别并使用 SME2，而不是把 `arm64-v8a`、ARM82、
编译宏或桌面结果误写成 SME2。

## 前置条件

- 同一台 Armv9 + SME2 手机、同一电量区间和散热条件。
- 同一 APK、Qwen Base、Adapter、Tokenizer、预处理、输入和随机种子。
- JNI `nativeMetrics()` 返回 MNN 版本、设备 ABI、检测到的 CPU capabilities、实际
  acceleration、首 Token、tokens/s、峰值 RSS、温度和功耗；缺字段不得用估算值填充。
- 准备可显式关闭 SME2 的 MNN 构建或运行开关，并在 RunTrace 中写出实际值。

## 测试步骤

1. 重启 App，等待设备温度恢复到同一范围。
2. 正式测试按 `OFF → ON → ON → OFF`（ABBA）执行两轮。
3. 每个 block 切换后完全释放 Session 并重建 CPU dispatch；执行 2 次预热 + 5 次正式样本。
4. 创建 suite 时锁定 APK version/versionCode、MNN/JNI 版本、设备/Android/ABI 和固定
   Input SHA256。每完成一个 sample，就将原始耗时、环境、运行时、原始/规范化输出哈希与
   推进后的 suite/pair/leg 状态在同一 IndexedDB 事务中提交，不等整组结束。
5. ON 样本必须同时记录 `hardwareSme2=true`、`cpuTarget=3`、`sme2Effective=true`；OFF 样本必须停留在 target 2。
6. 正式结果为 A/OFF 20 次、B/ON 20 次；预热共 16 次，不进入 P50/P95。
7. 每条 sample 必须通过固定输出质量门、thermal status ≤ 1、电池温度 ≤ 42℃、suite 内
   温差 ≤ 2℃。恢复时版本或 Input SHA 变化、温控超限或输出失败都会使 suite 立即失效。
8. 比较 P50/P95 首 Token、prefill/decode、总耗时、tokens/s、峰值内存和温升；不可靠估算
   的功耗字段留空。导出 ZIP 同时包含汇总、原始样本、配置记录、logcat、Perfetto 可导入
   应用轨迹、各文件 SHA256 manifest 与系统级 Perfetto 边界说明。

## 通过标准

- ON 组同时具备“硬件 capability 检测”和“MNN 实际启用”两条日志。
- OFF/ON 使用同一模型与输入，输出通过既定 Quality Gate。
- 正式结论只使用每模式 20 次的 ABBA×2 结果；各5 次的快速复测只做现场旁证，不把其 P95 写成稳定结论。
- 原始日志、汇总 CSV、设备型号/系统/芯片、APK SHA256 和模型哈希一并归档。

## 当前状态

`APP-SIDE HARNESS READY / DEVICE RUN NOT RUN`。

- Agents 内容区第一位已加入默认展开的 `DEVICE LAB · MNN × SME2 真机验收台`。
- `MNN OFF/ON` 是 Android 原生门禁；OFF 后 JNI 拒绝端侧推理并把控制权交给规则回退。
- `SME2 OFF` 将 MNN CPU target 固定为 2（FP16/SDOT/I8MM 基线）；`SME2 ON` 请求
  target 3。界面只有在 MNN 自身 CPU 探测、target 3 与 dispatch 三者同时成立时才显示
  `SME2 EFFECTIVE`。
- 每次切换都会释放已加载 Session，再重建 CPU dispatch；Trace 保存端到端切换、Session
  释放、dispatch 重建、原生总耗时、配置代次与最终有效状态。
- “当前模式 2+5 实测”保留为现场快速复测；“正式 ABBA×2”保存 A/B 各20次正式样本、P50/P95、首 Token、prefill/decode、tokens/s、PSS/RSS、温度、电量与全部原始样本。
- `pocket-device-evidence/v2` 与 `SME2 A/B 验收账本` 均以 IndexedDB 持久化；本机安装身份
  也不再写入 localStorage。账本长期保存 suite、pair/leg、sample 和外部证据，中断后显示
  下一个应测模式。
- 完整 ZIP 包含配置记录、原始样本、输出 SHA-256、logcat、Perfetto 元数据和用户导入的
  系统证据原件。应用轨迹可直接导入 Perfetto UI，但会如实标记
  `systemTraceCaptured=false`；若主办方要求系统 sched/freq Perfetto，再连接电脑采集。

当前 `adb devices -l` 没有连接目标手机，因此仍没有伪造任何 SME2 性能数字。开发机
编译、APK 静态验收和网页预览不能替代本协议的目标机结果。
