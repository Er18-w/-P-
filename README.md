# 批量P图

在浏览器本地批量添加 Logo、调整画面并导出图片的工具。

## 当前功能

- 批量导入图片并按真实比例自动生成独立任务
- 图片可跨比例任务勾选，导出时按比例文件夹结构生成一个 ZIP
- 每个比例任务保存自己的 Logo 组合、位置和修图参数
- Logo 上传后可自动去除连通背景，也可点选、擦除、恢复并裁掉透明空白
- Logo 库支持可视化多选、命名、分组并在浏览器中保存
- 多个 Logo 的位置可保存为组合预设，并跨比例任务复用
- 在预览图上直接拖动 Logo，或使用固定位置和智能避色
- 整组应用亮度、对比度和饱和度调整
- 整组批量人脸识别、磨皮与肤色提亮
- 按原尺寸或指定最长边高清压缩，并导出真实 ZIP 文件

图片只在用户自己的浏览器中处理，不上传服务器。

## 开源组件

- [magic-wand-js](https://github.com/Tamersoul/magic-wand-js)（MIT）：颜色容差与连通区域选择，许可证见 `third-party/MAGIC-WAND-LICENSE.txt`
- [tracking.js](https://github.com/eduardolundgren/tracking.js)（BSD）：浏览器本地人脸检测，许可证见 `third-party/TRACKING-LICENSE.md`
- [StackBlur](https://github.com/flozz/StackBlur)（MIT）：高性能人像区域平滑，许可证见 `third-party/STACKBLUR-LICENSE.txt`
