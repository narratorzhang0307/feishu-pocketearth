// 3D 渲染依赖（three / gaussian-splats-3d）不随包提供 .d.ts，本项目一直以 any 使用。
// 这里补最小环境声明，消除 noImplicitAny 报错，同时不引入全量 @types/three
// 以免把强类型级联进现有 3D 组件、触发大面积改动。需要精细类型时再单独引入。
declare module 'three';
declare module 'three/examples/jsm/*';
declare module '@mkkellogg/gaussian-splats-3d';
