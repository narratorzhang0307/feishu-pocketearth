// 已重构为解耦的 src/app/lib/photo/ 六层模块（感知/记忆/推理/行动/反思/协作）。
// 此文件保留为转发壳，旧 import 不破。新代码请直接从 './photo' 引入。
export * from './photo';
export type { PhotoResult as ScreenResult } from './photo';
