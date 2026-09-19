// FINVORA Dashboard Client Logic & Chart.js Integration
document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Sidebar Toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 1024 && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  // 2. Copy Referral Link Helper
  const copyBtn = document.getElementById('btn-copy-ref');
  const refInput = document.getElementById('ref-link-input');
  if (copyBtn && refInput) {
    copyBtn.addEventListener('click', () => {
      refInput.select();
      refInput.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(refInput.value).then(() => {
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span>✓ Copied!</span>';
        copyBtn.classList.remove('btn-outline');
        copyBtn.classList.add('btn-primary');
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.classList.remove('btn-primary');
          copyBtn.classList.add('btn-outline');
        }, 2500);
      });
    });
  }

  // 3. Initialize Financial Charts if Chart.js is loaded and canvas elements exist
  const roiCtx = document.getElementById('roiHistoryChart');
  const incomeDistCtx = document.getElementById('incomeDistChart');

  if (typeof Chart !== 'undefined' && (roiCtx || incomeDistCtx)) {
    // Fetch Chart Data from API
    fetch('/api/v1/charts')
      .then(res => res.json())
      .then(json => {
        if (!json.success || !json.data) return;
        const data = json.data;

        // Chart 1: ROI History Line Chart
        if (roiCtx) {
          const ctx = roiCtx.getContext('2d');
          const gradient = ctx.createLinearGradient(0, 0, 0, 250);
          gradient.addColorStop(0, 'rgba(87, 193, 157, 0.35)');
          gradient.addColorStop(1, 'rgba(13, 108, 159, 0.0)');

          new Chart(roiCtx, {
            type: 'line',
            data: {
              labels: data.roiHistory.dates.length ? data.roiHistory.dates : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              datasets: [{
                label: 'ROI Payout ($)',
                data: data.roiHistory.amounts.length ? data.roiHistory.amounts : [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#57C19D',
                borderWidth: 2.5,
                backgroundColor: gradient,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#B3EB91',
                pointBorderColor: '#050505',
                pointBorderWidth: 2,
                pointRadius: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: '#0C1112',
                  titleColor: '#FFFFFF',
                  bodyColor: '#57C19D',
                  borderColor: '#1B2527',
                  borderWidth: 1,
                  padding: 10,
                  displayColors: false
                }
              },
              scales: {
                x: {
                  grid: { color: '#141D1F' },
                  ticks: { color: '#9CA3AF', font: { family: 'Plus Jakarta Sans', size: 11 } }
                },
                y: {
                  grid: { color: '#141D1F' },
                  ticks: {
                    color: '#9CA3AF',
                    font: { family: 'Plus Jakarta Sans', size: 11 },
                    callback: (val) => '$' + val
                  }
                }
              }
            }
          });
        }

        // Chart 2: Income Distribution Doughnut
        if (incomeDistCtx) {
          const breakdown = data.incomeBreakdown;
          const hasEarnings = breakdown.values.some(v => v > 0);

          new Chart(incomeDistCtx, {
            type: 'doughnut',
            data: {
              labels: breakdown.labels,
              datasets: [{
                data: hasEarnings ? breakdown.values : [1, 1, 1, 1],
                backgroundColor: [
                  '#0D6C9F', // ROI: Blue
                  '#37A5A1', // Referral: Teal
                  '#57C19D', // Level: Green
                  '#B3EB91'  // Salary: Lime
                ],
                borderColor: '#0C1112',
                borderWidth: 3,
                hoverOffset: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: {
                    color: '#9CA3AF',
                    font: { family: 'Plus Jakarta Sans', size: 11 },
                    padding: 14,
                    usePointStyle: true
                  }
                },
                tooltip: {
                  backgroundColor: '#0C1112',
                  borderColor: '#1B2527',
                  borderWidth: 1,
                  callbacks: {
                    label: (ctx) => {
                      const label = ctx.label || '';
                      const value = ctx.raw || 0;
                      return hasEarnings ? ` ${label}: $${value.toFixed(2)}` : ` ${label}: $0.00`;
                    }
                  }
                }
              },
              cutout: '70%'
            }
          });
        }
      })
      .catch(err => console.error('Failed to load chart data:', err));
  }
});
