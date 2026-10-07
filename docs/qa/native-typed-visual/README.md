# 结构化题目视觉验收：阶段记录

本目录先归档20张逐张打开检查的iPad原始PNG：句子组成8张、A/B阅读8张、概要听力4张。来源是 `.local/native-typed-ipad-restored.xcresult` 中对应通过的三个真实UI方法；整次bundle另有一个双空位测试脚本选择错误，不能说整次六项全过。每张图的fixture SHA、canonical ID/revision、材料引用、方法、设备、时间与原始文件SHA在 [evidence.json](evidence.json)。截图没有裁切、拼接或重绘。

已目视核对：未答排序不能提交，完成排列后★位置明确；正确/错误排列保留完整答案与长解析。A/B两篇原文分别呈现，选择、正确/错误标记和长解说可读。概要听力播放前及暂停时没有问题/选项，成功播放结束才出现；完成页正确率依据实际选择。

## 发现问题并继续修复

初次iPad五个UI方法通过，但人工检查额外发现：表格的自适应单元格使费用/时间列挤到很远的横向区域；图片选项在素材区及选项内重复。代码已改为固定120点表格列宽、选项绑定图片只在选项内呈现。旧表格/图片截图留在 `.local/native-typed-ipad-restored-export` 作为诊断，未归档为修复后视觉通过。

双空位脚本原本选第二空option-1，fixture真正答案是option-0（そのため）。只改测试脚本，没有更改正确答案；手机修正测试已通过，iPad最终复验也通过。最终布局复验bundle为 `.local/native-typed-layout-final.xcresult`。手机逐型bundle为 `.local/native-typed-phone-restored.xcresult`；最终布局bundle的78项单测和3项UI测试全部通过；手机bundle的6项UI测试全部通过。手机45张原始PNG已导出至 `.local/native-typed-phone-restored-export`，尚未逐张打开；最终iPad布局截图仍待导出检查。这些图片不计入本目录视觉通过数量，手机此次bundle也不认证后来两处布局修复的最终像素。

专用旧iPad元数据存在而数据目录缺失，专用旧iPhone启动/runner断联。本Mac新建两个仅供本任务的设备，没有删/重置其他模拟器：iPad `02F114E0-712C-4380-8EE7-CD646227D93B`，iPhone `39D4FBF2-A3B0-468E-BD0B-DDA1380F0081`。没有更换执行环境。

旧135张文本兼容PNG仍是历史基线；本目录20张也不是23类全量验收。仍需补最终修复的表格/图片、手机全部逐型目视、精确目标词专项像素检查，以及旧17类有效宽屏重拍。Web/MCP浏览器像素工具缺失，不表示功能实现停止，见 [Web/MCP结构化实现](../typed-web-mcp-implementation.md)。
