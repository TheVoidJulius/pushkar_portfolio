/**
 * Low-res land mask for the dotted visitor globe, generated once offline from
 * Natural Earth 110m land (public domain). Each row is one latitude band
 * (81 to -57 degrees, every 3); the band holds round(120 * cos(lat)) evenly
 * spaced longitudes, and its hex string is that band's land bitmask, most
 * significant bit first (trailing zero digits trimmed).
 */
export const LAND_LAT_TOP = 81;
export const LAND_LAT_STEP = 3;
export const LAND_LON_PER_BAND = 120;

export const LAND_ROWS: readonly string[] = [
  "0782",
  "05e4",
  "00bc099",
  "03e7003f4",
  "3eb9c0c3ffe",
  "bffa763bffff8",
  "3ff8980ffffffc",
  "1bfc40019fffff4",
  "00ff18010fffffc4",
  "007fef0007fffffe2",
  "001fffc007fffffff",
  "000fffd001fffffffe",
  "0007fff0003bbdffffe",
  "0003ffe00039617ffff8",
  "0001ffe0000c07effff9",
  "0000fff00000603fffff84",
  "00003ff00000fc0ffffff1",
  "00001fd800007fffdffffe",
  "0000078400007ffff7ffff8",
  "0000038000003fffdf0fffe",
  "000001c800001fffffc1e78",
  "0000007880000ffffbe0e1e1",
  "0000000e00000ffffec03078",
  "00000002000007ffff80102c",
  "00000000fe0001fffff000082",
  "000000003f8000f7fff",
  "000000003fe00001fff000086",
  "000000007fe00001ffc00006e",
  "000000007ffe0001ff80000268e2",
  "000000007fff0000ff000000007",
  "000000007fff0000ff8000000028",
  "000000007ffc0001ff",
  "000000003ff80003fe4000003c8",
  "000000001ff80007f9800000fe004",
  "000000003fe0000fe200000ffc1",
  "000000007f80001fcc00003ff8",
  "00000000fe00003e000001ffe",
  "00000001fc000078000007ff",
  "00000003f00000c0000018f8",
  "000000078000000000000381",
  "0000000c000000000000001",
  "0000003000000000000081",
  "000000600000000000002",
  "0000018",
  "000002",
  "000004",
  "",
];

/** Unpacks the mask into [lon, lat] degree pairs (flat array). */
export function landDots(): Float32Array {
  const out: number[] = [];
  LAND_ROWS.forEach((hex, r) => {
    const lat = LAND_LAT_TOP - r * LAND_LAT_STEP;
    const n = Math.max(1, Math.round(LAND_LON_PER_BAND * Math.cos((lat * Math.PI) / 180)));
    for (let d = 0; d < hex.length; d++) {
      const nib = parseInt(hex[d], 16);
      for (let b = 0; b < 4; b++) {
        const i = d * 4 + b;
        if (i < n && nib & (8 >> b)) out.push(-180 + ((i + 0.5) * 360) / n, lat);
      }
    }
  });
  return new Float32Array(out);
}
