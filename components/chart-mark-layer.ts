import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { ChartDrawing } from "@/lib/chart-drawings";

type CandleSeries = ISeriesApi<"Candlestick", Time>;

function place(
  chart: IChartApi,
  series: CandleSeries,
  time: number,
  price: number,
  horizontalPixelRatio: number,
  verticalPixelRatio: number,
) {
  const x = chart.timeScale().timeToCoordinate(time as Time);
  const y = series.priceToCoordinate(price);
  if (x == null || y == null) return null;
  return { x: Number(x) * horizontalPixelRatio, y: Number(y) * verticalPixelRatio };
}

class MarkRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly source: MarkPrimitive) {}

  draw(target: CanvasRenderingTarget2D) {
    const { chart, series } = this.source;
    if (!chart || !series) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      for (const mark of this.source.drawings) {
        if (mark.type === "level") continue;
        ctx.save();
        if (mark.type === "trend") {
          const from = place(chart, series, mark.time1, mark.price1, scope.horizontalPixelRatio, scope.verticalPixelRatio);
          const to = place(chart, series, mark.time2, mark.price2, scope.horizontalPixelRatio, scope.verticalPixelRatio);
          if (from && to) {
            ctx.strokeStyle = "#111315";
            ctx.lineWidth = 2 * scope.verticalPixelRatio;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
          }
        } else if (mark.type === "zone") {
          const from = place(chart, series, mark.time1, mark.price1, scope.horizontalPixelRatio, scope.verticalPixelRatio);
          const to = place(chart, series, mark.time2, mark.price2, scope.horizontalPixelRatio, scope.verticalPixelRatio);
          if (from && to) {
            ctx.fillStyle = "rgba(154, 114, 9, 0.16)";
            ctx.strokeStyle = "#9a7209";
            ctx.lineWidth = scope.verticalPixelRatio;
            const x = Math.min(from.x, to.x);
            const y = Math.min(from.y, to.y);
            const width = Math.abs(to.x - from.x);
            const height = Math.abs(to.y - from.y);
            ctx.fillRect(x, y, width, height);
            ctx.strokeRect(x, y, width, height);
          }
        } else if (mark.type === "note") {
          const point = place(chart, series, mark.time, mark.price, scope.horizontalPixelRatio, scope.verticalPixelRatio);
          if (point) {
            ctx.fillStyle = "#9a7209";
            ctx.font = `${12 * scope.verticalPixelRatio}px sans-serif`;
            ctx.fillText(mark.text, point.x + 6 * scope.horizontalPixelRatio, point.y);
          }
        }
        ctx.restore();
      }
    });
  }
}

class MarkPaneView implements IPrimitivePaneView {
  private readonly rendererInstance: MarkRenderer;
  constructor(source: MarkPrimitive) {
    this.rendererInstance = new MarkRenderer(source);
  }
  zOrder() {
    return "top" as const;
  }
  renderer() {
    return this.rendererInstance;
  }
}

export class MarkPrimitive implements ISeriesPrimitive<Time> {
  drawings: ChartDrawing[] = [];
  chart: IChartApi | null = null;
  series: CandleSeries | null = null;
  private requestUpdate: () => void = () => {};
  private readonly paneView: MarkPaneView;

  constructor() {
    this.paneView = new MarkPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time, "Candlestick">) {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
  }

  setDrawings(drawings: ChartDrawing[]) {
    this.drawings = drawings;
    this.requestUpdate();
  }

  updateAllViews() {}

  paneViews() {
    return [this.paneView];
  }
}
