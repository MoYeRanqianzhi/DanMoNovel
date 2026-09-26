/**
 * 飞行过渡的时间编排
 *
 * 飞行引擎（FlightContext）与路由（Router）都要用到同一套时间：
 * 例如"开书推进"时，阅读页必须在书页推满屏幕之后才出现，
 * 两边各写一个数字迟早会对不上，所以集中放在这里。
 */

/** 书在两个书位之间飞行（书架 → 详情、详情 → 书架） */
export const HOP_MS = 760;

/**
 * 开书推进（详情/继续读 → 阅读器）。各阶段以总时长的比例表示：
 * 0 → face：书飞到屏幕中央并转为正面
 * face → open：封面翻开、内页散开
 * open → zoom：镜头推进，右手页铺满屏幕，假文字行逐渐淡去
 * reveal：阅读页在覆盖层下方出现，随后覆盖层淡出
 */
export const DIVE = {
  total: 1500,
  face: 0.28,
  open: 0.58,
  zoom: 0.88,
  reveal: 0.9,
} as const;

/**
 * 逆向浮出（阅读器 → 原来的书位）。
 * 0 → cover：空白书页淡入盖住阅读页
 * cover → back：镜头拉远，回到打开的书
 * back → close：合上封面、回到屏幕中央
 * close → 1：飞回原书位
 */
export const SURFACE = {
  total: 1300,
  cover: 0.14,
  back: 0.42,
  close: 0.66,
} as const;

/** 页面进出场时长（与 transitions.css 保持一致） */
export const SCREEN_ENTER_MS = 320;
export const SCREEN_EXIT_MS = 260;

/** 阅读页在开书推进中出现的时刻（ms） */
export const DIVE_REVEAL_MS = Math.round(DIVE.total * DIVE.reveal);
