import React from 'react';
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

export default function SterilizationChart({ telemetryData }) {
  const labels = telemetryData.map((d) => d.time);
  const temperatures = telemetryData.map((d) => d.temperature);
  const pressures = telemetryData.map((d) => d.pressure);

  const data = {
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
        pointRadius: 1,
        pointHoverRadius: 4,
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
        pointRadius: 1,
        pointHoverRadius: 4,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { family: 'JetBrains Mono', size: 11 },
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
        titleFont: { family: 'JetBrains Mono' },
        bodyFont: { family: 'JetBrains Mono' }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
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
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (v) => `${v}°C`
        }
      },
      yPress: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0,
        max: 3.0,
        grid: { drawOnChartArea: false },
        ticks: {
          color: '#ec4899',
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (v) => `${v} bar`
        }
      }
    }
  };

  return (
    <div className="w-full h-72 md:h-80">
      <Line data={data} options={options} />
    </div>
  );
}
