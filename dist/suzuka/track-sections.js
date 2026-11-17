// Venue-specific safety treatment checked against the official July2026
// Suzuka Course Guide and2026 FIA circuit map. Lateral distances are visual
// estimates; the official plans are not a barrier/kerb survey.
export const SUZUKA_SAFETY_AREAS=Object.freeze([
 {turn:1,span:105,near:3,far:42,kind:'gravel'},
 {turn:2,span:90,near:3,far:31,kind:'gravel'},
 {turn:7,span:100,near:3,far:27,kind:'gravel'},
 {turn:8,span:68,near:1.8,far:25,kind:'gravel'},
 {turn:9,span:58,near:1.6,far:18,kind:'gravel'},
 {turn:11,span:80,near:2.2,far:29,kind:'gravel'},
 {turn:13,span:118,near:3.4,far:42,kind:'gravel'},
 {turn:14,span:110,near:3,far:40,kind:'gravel'},
 {turn:15,span:118,near:3.5,far:48,kind:'gravel'},
 {turn:16,span:68,near:.9,far:23,kind:'escape asphalt'},
 {turn:17,span:54,near:.9,far:12,kind:'escape asphalt'},
]);
export const SUZUKA_BRAKING_TURNS=Object.freeze([1,8,9,11,13,16]);
