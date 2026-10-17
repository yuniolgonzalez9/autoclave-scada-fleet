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

// Registro único de controladores de Chart.js
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

// Opciones estáticas fuera del componente (Evita reinicializar el motor de Chart.js en cada render)
const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false, // Vital para telemetría continua sin caídas de frames
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      position: 'top',
      labels: {
        color: '#94a3b8',
        font: { family: 'JetBrains Mono, monospace', size: 11 },
        usePointStyle: true,
        boxWidth: 8
      }
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#00f3ff',
      bodyColor: '#e2e8f0',
      borderColor: 'rgba(0, 243, 255, 0.3)',
      borderWidth: 1,
      padding: 10,
      titleFont: { family: 'JetBrains Mono, monospace', size: 11 },
      bodyFont: { family: 'JetBrains Mono, monospace', size: 11 }
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255, 255, 255, 0.05)' },
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
      grid: { color: 'rgba(0, 243, 255, 0.1)' },
      ticks: {
        color: '#00f3ff',
        font: { family: 'JetBrains Mono, monospace', size: 10 },
        callback: (v) => `${v}°C`
      }
    },
    yPress: {
      type: 'linear',
      display: true,
      position: 'right',
      min: -1.0,
      max: 3.0,
      grid: { drawOnChartArea: false },
      ticks: {
        color: '#ec4899',
        font: { family: 'JetBrains Mono, monospace', size: 10 },
        callback: (v) => `${v}b`
      }
    }
  }
};

export default function SterilizationChart({ telemetryData = [] }) {
  // Memoización de datos para actualizar el gráfico únicamente cuando cambie la longitud o valor del historial
  const chartData = useMemo(() => {
    const safeData = Array.isArray(telemetryData) ? telemetryData : [];
    const labels = safeData.map((d) => d.time || '--:--');
    const temperatures = safeData.map((d) => (typeof d.temperature === 'number' ? d.temperature : 25.0));
    const pressures = safeData.map((d) => (typeof d.pressure === 'number' ? d.pressure : 0.0));

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
          pointRadius: safeData.length > 20 ? 1 : 2,
          pointHoverRadius: 5
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
          pointRadius: safeData.length > 20 ? 1 : 2,
          pointHoverRadius: 5
        }
      ]
    };
  }, [telemetryData]);

  return (
    <div className="w-full h-72 md:h-80 select-none">
      <Line data={chartData} options={CHART_OPTIONS} />
    </div>
  );
}
