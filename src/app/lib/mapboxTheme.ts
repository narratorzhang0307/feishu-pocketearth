// 给公园/绿地/森林/景区图层套一层柔和浅绿，让漫游底图更统一、更耐看。
// 来源：参考项目「把所有的诗都种回到地球上」
export function applySoftGreenParksTheme(map: mapboxgl.Map) {
  const style = map.getStyle?.();
  if (!style?.layers?.length) return;

  const FILL = "#CFEFD6"; // soft mint green
  const LINE = "#BFE7C8";
  const FILL_OPACITY = 0.28;

  const GREEN_LAYER_ID_RE =
    /(park|landuse|national-park|forest|wood|grass|meadow|golf|pitch|cemetery|garden)/i;

  for (const layer of style.layers) {
    if (!layer?.id) continue;
    if (!GREEN_LAYER_ID_RE.test(layer.id)) continue;

    if (layer.type === "fill") {
      try {
        map.setPaintProperty(layer.id, "fill-color", FILL);
        map.setPaintProperty(layer.id, "fill-opacity", FILL_OPACITY);
      } catch {}
    }

    if (layer.type === "line") {
      try {
        map.setPaintProperty(layer.id, "line-color", LINE);
        map.setPaintProperty(layer.id, "line-opacity", 0.35);
      } catch {}
    }
  }
}

// Public Earth is an editorial pasteboard: muted sea and land, quiet borders,
// and only geographic labels. Signal cards provide the visual emphasis.
export function applyPublicEarthTheme(map: mapboxgl.Map) {
  const style = map.getStyle?.();
  if (!style?.layers?.length) return;

  for (const layer of style.layers) {
    if (!layer?.id) continue;
    try {
      if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", "#c9c6bd");
      if (/water|ocean/i.test(layer.id) && layer.type === "fill") {
        map.setPaintProperty(layer.id, "fill-color", "#a9bfbe");
        map.setPaintProperty(layer.id, "fill-opacity", 0.95);
      }
      if (/(land|landuse|park|national-park|forest|wood|grass|meadow|garden)/i.test(layer.id)) {
        if (layer.type === "fill") {
          const green = /(park|forest|wood|grass|meadow|garden)/i.test(layer.id);
          map.setPaintProperty(layer.id, "fill-color", green ? "#b8cbb4" : "#cec9bd");
          map.setPaintProperty(layer.id, "fill-opacity", green ? 0.74 : 0.94);
        }
        if (layer.type === "line") {
          map.setPaintProperty(layer.id, "line-color", "#747b73");
          map.setPaintProperty(layer.id, "line-opacity", 0.46);
        }
      }
      if (/(road|bridge|tunnel)/i.test(layer.id) && layer.type === "line") {
        map.setPaintProperty(layer.id, "line-color", "#8e8980");
        map.setPaintProperty(layer.id, "line-opacity", 0.5);
      }
      if (/(admin|boundary)/i.test(layer.id) && layer.type === "line") {
        map.setPaintProperty(layer.id, "line-color", "#5c5a54");
        map.setPaintProperty(layer.id, "line-opacity", 0.6);
      }
      if (layer.type === "symbol") {
        const country = /country-label/i.test(layer.id);
        const place = country || /(state-label|settlement.*label|place-label)/i.test(layer.id);
        map.setLayoutProperty(layer.id, "visibility", place ? "visible" : "none");
        if (place) {
          map.setPaintProperty(layer.id, "text-color", country ? "#4f504a" : "#66675f");
          map.setPaintProperty(layer.id, "text-halo-color", "#ded9cc");
          map.setPaintProperty(layer.id, "text-halo-width", 1.15);
          map.setPaintProperty(layer.id, "text-opacity", country ? 0.72 : 0.56);
          try { map.setPaintProperty(layer.id, "icon-opacity", 0); } catch {}
        }
      }
    } catch {}
  }
}

// 把地图上所有文字标注（地名、道路、POI 等）切换为中文。
// Mapbox 矢量底图自带 name_zh-Hans 字段，没有中文时回退到本地名 / 英文名。
export function setMapLabelsToChinese(map: mapboxgl.Map) {
  const style = map.getStyle?.();
  if (!style?.layers?.length) return;

  const zhField = [
    "coalesce",
    ["get", "name_zh-Hans"],
    ["get", "name_zh-Hant"],
    ["get", "name_zh"],
    ["get", "name"],
  ];

  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const textField = (layer as any).layout?.["text-field"];
    if (!textField) continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", zhField as any);
    } catch {}
  }
}
