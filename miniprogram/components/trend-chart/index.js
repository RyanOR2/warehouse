// components/trend-chart/index.js
// canvas 2d 自绘折线图组件：支持多序列、图例、坐标轴、触摸查看数据点
Component({
  properties: {
    labels: { type: Array, value: [] },
    series: { type: Array, value: [] }, // [{ name, color, data: number[] }]
  },

  data: {
    tooltip: { visible: false, x: 0, label: "", lines: [] },
  },

  observers: {
    "labels, series": function () {
      if (this._ready) this.draw();
    },
  },

  lifetimes: {
    ready() {
      this._ready = true;
      this.draw();
    },
  },

  methods: {
    draw() {
      const query = this.createSelectorQuery();
      query
        .select("#chart")
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext("2d");
          const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
          const width = res[0].width;
          const height = res[0].height;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          this.render(ctx, width, height);
        });
    },

    render(ctx, width, height) {
      ctx.clearRect(0, 0, width, height);
      const { labels, series } = this.data;
      if (!labels || !labels.length || !series || !series.length) {
        this.drawEmpty(ctx, width, height);
        this._layout = null;
        return;
      }

      const padding = { top: 40, right: 16, bottom: 32, left: 48 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      if (plotWidth <= 0 || plotHeight <= 0) return;

      // y 轴范围（支持负值，如净利润为负时不裁剪）
      let maxVal = 0;
      let minVal = 0;
      series.forEach((s) =>
        (s.data || []).forEach((v) => {
          maxVal = Math.max(maxVal, v);
          minVal = Math.min(minVal, v);
        })
      );
      if (maxVal === minVal) maxVal = minVal + 1;
      maxVal = this.niceMax(maxVal);
      minVal = minVal < 0 ? -this.niceMax(Math.abs(minVal)) : 0;
      const range = maxVal - minVal;

      const xAt = (i) =>
        labels.length === 1
          ? padding.left + plotWidth / 2
          : padding.left + (plotWidth * i) / (labels.length - 1);
      const yAt = (v) => padding.top + plotHeight * (1 - (v - minVal) / range);

      // 网格线 + y 轴刻度
      ctx.strokeStyle = "#f0f0f0";
      ctx.lineWidth = 1;
      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const yTicks = 4;
      for (let i = 0; i <= yTicks; i++) {
        const val = minVal + (range / yTicks) * i;
        const y = yAt(val);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(this.formatAxis(val), padding.left - 6, y);
      }

      // x 轴标签（抽样，最多 8 个）
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const maxLabels = 8;
      const step = Math.max(1, Math.ceil(labels.length / maxLabels));
      labels.forEach((label, i) => {
        if (i % step === 0 || i === labels.length - 1) {
          ctx.fillText(label, xAt(i), height - padding.bottom + 6);
        }
      });

      // 折线与数据点
      series.forEach((s) => {
        const data = s.data || [];
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((v, i) => {
          const x = xAt(i);
          const y = yAt(v);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = s.color;
        data.forEach((v, i) => {
          ctx.beginPath();
          ctx.arc(xAt(i), yAt(v), 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      // 图例
      this.drawLegend(ctx, padding, series);

      this._layout = { padding, plotWidth, plotHeight, maxVal, width, count: labels.length };
    },

    drawLegend(ctx, padding, series) {
      const itemWidth = 90;
      let x = padding.left;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      series.forEach((s) => {
        ctx.fillStyle = s.color;
        ctx.fillRect(x, 10, 12, 12);
        ctx.fillStyle = "#6b7280";
        ctx.fillText(s.name, x + 16, 16);
        x += itemWidth;
      });
    },

    drawEmpty(ctx, width, height) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("暂无数据", width / 2, height / 2);
    },

    niceMax(v) {
      const exp = Math.floor(Math.log10(v));
      const base = Math.pow(10, exp);
      const n = v / base;
      const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
      return nice * base;
    },

    formatAxis(v) {
      const abs = Math.abs(v);
      if (abs >= 10000) return (v / 10000).toFixed(1) + "万";
      if (abs >= 1000) return (v / 1000).toFixed(1) + "千";
      return String(Math.round(v));
    },

    formatValue(v) {
      if (v === null || v === undefined || v === "") return "—";
      const n = Number(v);
      if (Number.isNaN(n)) return String(v);
      return n.toFixed(2);
    },

    onTouch(e) {
      if (!this._layout || !e.touches || !e.touches.length) return;
      const touch = e.touches[0];
      const { padding, plotWidth, width, count } = this._layout;
      const x = touch.x;
      const plotX = x - padding.left;
      if (plotX < 0 || plotX > plotWidth) return;
      const idx = count === 1 ? 0 : Math.round((plotX / plotWidth) * (count - 1));
      const label = this.data.labels[idx];
      const lines = this.data.series.map((s) => ({
        name: s.name,
        color: s.color,
        value: this.formatValue((s.data || [])[idx]),
      }));
      // 限制 tooltip 不超出容器
      const tooltipX = Math.max(70, Math.min(width - 70, x));
      this.setData({ tooltip: { visible: true, x: tooltipX, label, lines } });
    },

    onTouchEnd() {
      this.setData({ "tooltip.visible": false });
    },
  },
});
