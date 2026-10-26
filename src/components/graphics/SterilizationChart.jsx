import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Registro formal de controladores de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const MAX_DISPLAY_POINTS = 300; // Ventana deslizante para proteger GPU/Canvas en ciclos prolongados

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false, // Desactivado para telemetría industrial de alta frecuencia
  normalized: true, // Optimización interna de indexación de Chart.js
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      position: 'top',
      labels: {
        color: '#94a3b8',
        font: { family: 'JetBrains Mono, monospace', size: 11, weight: 'bold' },
        usePointStyle: true,
        boxWidth: 8,
        padding: 12
      }
    },
    tooltip: {
      backgroundColor: 'rgba(3, 7, 18, 0.95)',
      titleColor: '#00f3ff',
      bodyColor: '#e2e8f0',
      borderColor: 'rgba(0, 243, 255, 0.4)',
      borderWidth: 1,
      padding: 10,
      titleFont: { family: 'JetBrains Mono, monospace', size: 11, weight: 'bold' },
      bodyFont: { family: 'JetBrains Mono, monospace', size: 11 },
      callbacks: {
        label: (context) => {
          const val = context.parsed.y;
          if (val === null || val === undefined || isNaN(val)) return '—';
          if (context.dataset.yAxisID === 'yTemp') {
            return ` Temperatura: ${val.toFixed(1)} °C`;
          }
          if (context.dataset.yAxisID === 'yPress') {
            return ` Presión: ${val.toFixed(2)} bar`;
          }
          return ` ${context.dataset.label}: ${val}`;
        }
      }
    }
  },
  scales: {
    x: {
      grid: { 
        color: 'rgba(255, 255, 255, 0.05)',
        drawTicks: false
      },
      ticks: { 
        color: '#64748b', 
        font: { family: 'JetBrains Mono, monospace', size: 10 },
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 8
      }
    },
    yTemp: {
      type: 'linear',
      display: true,
      position: 'left',
      min: 20,
      max: 145,
      grid: { 
        color: 'rgba(0, 243, 255, 0.1)',
        drawTicks: false
      },
      ticks: {
        color: '#00f3ff',
        font: { family: 'JetBrains Mono, monospace', size: 10, weight: 'bold' },
        callback: (v) => `${v}°C`,
        stepSize: 20
      }
    },
    yPress: {
      type: 'linear',
      display: true,
      position: 'right',
      min: -1.0,
      max: 3.0,
      grid: { 
        drawOnChartArea: false,
        drawTicks: false
      },
      ticks: {
        color: '#ec4899',
        font: { family: 'JetBrains Mono, monospace', size: 10, weight: 'bold' },
        callback: (v) => `${Number(v).toFixed(1)}b`,
        stepSize: 0.8
      }
    }
  }
};

export default function SterilizationChart({ telemetryData = [] }) {
  // Memoización y submuestreo de telemetría continua
  const chartData = useMemo(() => {
    const rawData = Array.isArray(telemetryData) ? telemetryData : [];
    
    // Si la serie histórica supera el límite de fluidez gráfica, aplicar ventana deslizante
    const safeData = rawData.length > MAX_DISPLAY_POINTS 
      ? rawData.slice(rawData.length - MAX_DISPLAY_POINTS) 
      : rawData;

    const labels = safeData.map((d, idx) => d.time || d.timestamp || `${idx * 0.8}s`);
    
    const temperatures = safeData.map((d) => {
      const t = parseFloat(d.temperature !== undefined ? d.temperature : d.temp_camara);
      return isNaN(t) ? null : t;
    });

    const pressures = safeData.map((d) => {
      const p = parseFloat(d.pressure !== undefined ? d.pressure : d.presion);
      return isNaN(p) ? null : p;
    });

    return {
      labels,
      datasets: [
        {
          label: 'Temperatura Cámara (°C)',
          data: temperatures,
          borderColor: '#00f3ff',
          backgroundColor: 'rgba(0, 243, 255, 0.08)',
          fill: true,
          tension: 0.35,
          yAxisID: 'yTemp',
          borderWidth: 2,
          pointRadius: safeData.length > 40 ? 0 : 2,
          pointHoverRadius: 5,
          spanGaps: true
        },
        {
          label: 'Presión Absoluta (bar)',
          data: pressures,
          borderColor: '#ec4899',
          backgroundColor: 'rgba(236, 72, 153, 0.08)',
          fill: true,
          tension: 0.35,
          yAxisID: 'yPress',
          borderWidth: 2,
          pointRadius: safeData.length > 40 ? 0 : 2,
          pointHoverRadius: 5,
          spanGaps: true
        }
      ]
    };
  }, [telemetryData]);

  return (
    <div className="w-full h-72 md:h-80 select-none font-mono">
      <Line data={chartData} options={CHART_OPTIONS} />
    </div>
  );
}
