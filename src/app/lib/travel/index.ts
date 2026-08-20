// 行程整理 agent · 解耦模块公共出口（六层架构）。详见 旅行 Agent/00-架构总纲.md。
export type {
  Pref, POI, Destination, StopGuide, DayPlan, PlanMode, PlanInput, TripPlan, TravelPlannerTrace, OnTravelPhase, TripMode, ManualStop,
  RawShot, Segment, Stay, Spot, TripArchive, OnArchivePhase,
} from './types';
export { PREFERENCES, TRIP_MODES, slug, seasonOf } from './types';
export { DESTINATIONS, destination } from './catalog';
export { planTrip, attachDayGuides, rankPOIs, cloudRankPOIs } from './plan';
export { runPlan, confirmTrip, pinManualStop, runArchive, confirmArchive } from './agent';
export { buildTripLines, getTrip, removeTripMarks } from './trip';
export type { TripView, TripStop } from './trip';
export { getTravelStats } from './stats';
export type { TravelStats } from './stats';
export { geocodeViaOSM, poiViaOSM, weatherViaOSM, forecastViaOSM } from './mcp';
export { weatherLine, rainAdvice, wmoText } from './weather';
export type { DailyWeather } from './weather';
export { flightLink, trainLink, hotelLink, addDays, cityCode, seatSummary } from './tickets';
export { trainsViaMcp, flightRefViaMcp, routeViaMcp } from './mcp';
export type { TrainRow, FlightRef } from './mcp';
export { discoverDestination } from './discover';
export { loadTravelPlaceBrief, buildPlaceBriefPrompt, normalizePlaceBriefText, isGroundedPlaceBrief, sourceExtractBrief } from './placeBrief';
export type { TravelPlaceBrief, TravelPlaceSource } from './placeBrief';

import type { PlanMode } from './types';
// 给 UI：排序来源的中文说明 + 颜色（云脑=按你跨域口味挑、端侧=本地真后端挑、本地=偏好命中度兜底）
export const MODE_LABEL: Record<PlanMode, string> = { 云脑: '按你的口味挑', 端侧: '端侧按偏好挑', 本地: '本地按偏好挑' };
export const MODE_COLOR: Record<PlanMode, string> = { 云脑: '#0a7d4a', 端侧: '#c08a00', 本地: '#8a6d3b' };
