/* ==========================================================================
   EstudoQ - Application Logic
   ========================================================================== */

// Storage Keys
const STORAGE_KEY_SESSIONS = 'estudoq_sessions_v1';
const STORAGE_KEY_SUBJECTS = 'estudoq_recent_subjects_v1';

// App State
let sessions = [];
let recentSubjects = [];
let activeSession = null;
let currentFilterPeriod = 'today'; // 'today', 'week', 'month', 'all'
let chartInstance = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  loadStorageData();
  setupKeyboardShortcuts();
  updateRecentSubjectsUI();
  registerServiceWorker();
  
  // Default to session view
  switchTab('session');
});

// Register Service Worker for PWA
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
      if ('caches' in window) {
        caches.keys().then(names => {
          for (let name of names) caches.delete(name);
        });
      }
      return;
    }
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('Service Worker registro ignorado:', err);
    });
  }
}

// Load Data from LocalStorage
function loadStorageData() {
  try {
    const savedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
    sessions = savedSessions ? JSON.parse(savedSessions) : [];

    const savedSubjects = localStorage.getItem(STORAGE_KEY_SUBJECTS);
    recentSubjects = savedSubjects ? JSON.parse(savedSubjects) : [];
  } catch (err) {
    console.error('Erro ao carregar dados do localStorage:', err);
    sessions = [];
    recentSubjects = [];
  }
}

// Save Data to LocalStorage
function saveStorageData() {
  try {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(recentSubjects));
  } catch (err) {
    console.error('Erro ao salvar no localStorage:', err);
  }
}

// Tab Switching
function switchTab(tabName) {
  const sessionTabBtn = document.getElementById('tab-btn-session');
  const historyTabBtn = document.getElementById('tab-btn-history');
  const sessionContent = document.getElementById('tab-session');
  const historyContent = document.getElementById('tab-history');

  if (tabName === 'session') {
    sessionTabBtn.classList.add('active');
    sessionTabBtn.setAttribute('aria-selected', 'true');
    historyTabBtn.classList.remove('active');
    historyTabBtn.setAttribute('aria-selected', 'false');

    sessionContent.classList.add('active');
    historyContent.classList.remove('active');
  } else if (tabName === 'history') {
    historyTabBtn.classList.add('active');
    historyTabBtn.setAttribute('aria-selected', 'true');
    sessionTabBtn.classList.remove('active');
    sessionTabBtn.setAttribute('aria-selected', 'false');

    historyContent.classList.add('active');
    sessionContent.classList.remove('active');

    // Update History & Analytics view
    updateHistoryView();
  }
}

// ==========================================================================
// SESSION MANAGEMENT (TAB 1)
// ==========================================================================

// Handle Form Submission to Start Session
function handleStartSession(event) {
  event.preventDefault();
  
  const subjectInput = document.getElementById('input-subject');
  const topicInput = document.getElementById('input-topic');

  const subject = subjectInput.value.trim();
  const topic = topicInput.value.trim();

  if (!subject || !topic) return;

  // Create Active Session State
  activeSession = {
    subject: subject,
    topic: topic,
    correct: 0,
    wrong: 0,
    history: [], // Stores boolean list for undo (true = correct, false = wrong)
    startTime: Date.now()
  };

  // Update UI Elements for Active Session
  document.getElementById('display-subject').textContent = activeSession.subject;
  document.getElementById('display-topic').textContent = activeSession.topic;
  
  updateLiveMetricsUI();

  // Show Active Session Card, Hide Setup Form Card
  document.getElementById('setup-card').classList.add('hidden');
  document.getElementById('active-session-card').classList.remove('hidden');

  // Add Subject to recent list
  addRecentSubject(subject);
}

// Handle Direct Start in Floating Mode
function handleStartFloatingSession(event) {
  if (event) event.preventDefault();
  
  const subjectInput = document.getElementById('input-subject');
  const topicInput = document.getElementById('input-topic');

  if (!subjectInput.value.trim() || !topicInput.value.trim()) {
    subjectInput.reportValidity();
    return;
  }

  handleStartSession(event);
  if (activeSession) {
    toggleFloatingWidget();
  }
}

// Record Answer (Acerto or Erro)
function recordAnswer(isCorrect) {
  if (!activeSession) return;

  if (isCorrect) {
    activeSession.correct += 1;
  } else {
    activeSession.wrong += 1;
  }

  activeSession.history.push(isCorrect);
  updateLiveMetricsUI();

  // Button feedback animation
  const btnId = isCorrect ? 'btn-correct' : 'btn-wrong';
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
      btn.style.transform = '';
    }, 120);
  }
}

// Undo Last Recorded Answer
function undoLastAnswer() {
  if (!activeSession || activeSession.history.length === 0) return;

  const lastAnswer = activeSession.history.pop();
  if (lastAnswer === true) {
    activeSession.correct = Math.max(0, activeSession.correct - 1);
  } else if (lastAnswer === false) {
    activeSession.wrong = Math.max(0, activeSession.wrong - 1);
  }

  updateLiveMetricsUI();
}

// Global reference to PiP Window
let pipWindowInstance = null;

// Update Real-Time Metrics UI
function updateLiveMetricsUI() {
  if (!activeSession) return;

  const total = activeSession.correct + activeSession.wrong;
  const correct = activeSession.correct;
  const wrong = activeSession.wrong;
  const accuracyRate = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('metric-total-count').textContent = total;
  document.getElementById('metric-correct-count').textContent = correct;
  document.getElementById('metric-wrong-count').textContent = wrong;
  document.getElementById('metric-accuracy-rate').textContent = `${accuracyRate}%`;

  const progressBar = document.getElementById('metric-progress-bar');
  progressBar.style.width = `${accuracyRate}%`;

  // Color change based on accuracy rate
  if (accuracyRate >= 80) {
    progressBar.style.background = 'linear-gradient(90deg, var(--primary), var(--success))';
  } else if (accuracyRate >= 50) {
    progressBar.style.background = 'linear-gradient(90deg, var(--warning), var(--primary))';
  } else {
    progressBar.style.background = 'linear-gradient(90deg, var(--danger), var(--warning))';
  }

  // Toggle Undo button disabled state
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) {
    undoBtn.disabled = activeSession.history.length === 0;
  }

  // Sync with PiP Floating Window if open
  if (pipWindowInstance && !pipWindowInstance.closed) {
    const doc = pipWindowInstance.document;
    if (doc.getElementById('pip-val-total')) {
      doc.getElementById('pip-val-total').textContent = total;
      doc.getElementById('pip-val-correct').textContent = correct;
      doc.getElementById('pip-val-wrong').textContent = wrong;
      doc.getElementById('pip-val-acc').textContent = `${accuracyRate}%`;
      const pipUndo = doc.getElementById('pip-btn-undo');
      if (pipUndo) pipUndo.disabled = activeSession.history.length === 0;
    }
  }
}

// Toggle Floating Widget (Document Picture-in-Picture / Popout Window)
async function toggleFloatingWidget() {
  if (!activeSession) {
    alert('Inicie uma bateria de questões primeiro.');
    return;
  }

  // Check if browser supports Document Picture-in-Picture (Chrome / Edge)
  if ('documentPictureInPicture' in window) {
    if (pipWindowInstance) {
      pipWindowInstance.close();
      pipWindowInstance = null;
      return;
    }

    try {
      pipWindowInstance = await documentPictureInPicture.requestWindow({
        width: 330,
        height: 380
      });

      // Copy styles to PiP window
      [...document.querySelectorAll('link[rel="stylesheet"], style')].forEach((styleNode) => {
        pipWindowInstance.document.head.appendChild(styleNode.cloneNode(true));
      });

      const total = activeSession.correct + activeSession.wrong;
      const accuracyRate = total > 0 ? Math.round((activeSession.correct / total) * 100) : 0;

      // Set PiP HTML
      pipWindowInstance.document.body.classList.add('pip-body');
      pipWindowInstance.document.body.innerHTML = `
        <div class="pip-container">
          <div class="pip-header">
            <span class="pip-subject" id="pip-subject">${escapeHtml(activeSession.subject)}</span>
            <div class="pip-topic" id="pip-topic">${escapeHtml(activeSession.topic)}</div>
          </div>

          <div class="pip-metrics">
            <div class="pip-metric-box">
              <span class="pip-metric-label">TOTAL</span>
              <span id="pip-val-total" class="pip-metric-val">${total}</span>
            </div>
            <div class="pip-metric-box">
              <span class="pip-metric-label">CERTO</span>
              <span id="pip-val-correct" class="pip-metric-val text-success">${activeSession.correct}</span>
            </div>
            <div class="pip-metric-box">
              <span class="pip-metric-label">ERRO</span>
              <span id="pip-val-wrong" class="pip-metric-val text-danger">${activeSession.wrong}</span>
            </div>
            <div class="pip-metric-box">
              <span class="pip-metric-label">% APRA</span>
              <span id="pip-val-acc" class="pip-metric-val text-accent">${accuracyRate}%</span>
            </div>
          </div>

          <div class="pip-buttons">
            <button id="pip-btn-correct" class="pip-btn btn-success-glow">
              <span class="pip-btn-title">ACERTO</span>
              <span class="pip-btn-shortcut">[ Tecla A / ➔ ]</span>
            </button>
            <button id="pip-btn-wrong" class="pip-btn btn-danger-glow">
              <span class="pip-btn-title">ERRO</span>
              <span class="pip-btn-shortcut">[ Tecla E / ⬅ ]</span>
            </button>
          </div>

          <div class="pip-footer">
            <button id="pip-btn-undo" class="btn btn-secondary btn-sm" style="flex:1;" ${activeSession.history.length === 0 ? 'disabled' : ''}>
              <span>Desfazer (Ctrl+Z)</span>
            </button>
            <button id="pip-btn-finish" class="btn btn-primary btn-sm" style="flex:1;">
              <span>Encerrar</span>
            </button>
          </div>
        </div>
      `;

      // Handlers inside PiP window
      const doc = pipWindowInstance.document;

      doc.getElementById('pip-btn-correct').addEventListener('click', () => recordAnswer(true));
      doc.getElementById('pip-btn-wrong').addEventListener('click', () => recordAnswer(false));
      doc.getElementById('pip-btn-undo').addEventListener('click', () => undoLastAnswer());
      doc.getElementById('pip-btn-finish').addEventListener('click', () => {
        finishSession();
        if (pipWindowInstance) {
          pipWindowInstance.close();
          pipWindowInstance = null;
        }
      });

      // Keyboard shortcuts inside PiP window
      doc.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'a' || e.key === 'ArrowRight') {
          e.preventDefault();
          recordAnswer(true);
        } else if (key === 'e' || e.key === 'ArrowLeft') {
          e.preventDefault();
          recordAnswer(false);
        } else if (key === 'z' || (e.ctrlKey && key === 'z')) {
          e.preventDefault();
          undoLastAnswer();
        }
      });

      // On PiP window closed
      pipWindowInstance.addEventListener('pagehide', () => {
        pipWindowInstance = null;
      });

    } catch (err) {
      console.error('Erro ao abrir Picture-in-Picture:', err);
      openPopoutWindow();
    }
  } else {
    // Fallback: Open popout window
    openPopoutWindow();
  }
}

function openPopoutWindow() {
  window.open(
    window.location.href,
    'EstudoQMini',
    'width=350,height=480,resizable=yes,scrollbars=no,status=no'
  );
}

// Cancel Session Confirmation
function confirmCancelSession() {
  if (!activeSession) return;

  const total = activeSession.correct + activeSession.wrong;
  if (total > 0) {
    if (!confirm('Deseja realmente cancelar esta bateria? Os dados desta sessão não serão salvos.')) {
      return;
    }
  }

  resetSessionUI();
}

// Finish Session and Save Record
function finishSession() {
  if (!activeSession) return;

  const total = activeSession.correct + activeSession.wrong;

  if (total === 0) {
    alert('Por favor, responda ao menos 1 questão antes de encerrar a bateria.');
    return;
  }

  const accuracy = Math.round((activeSession.correct / total) * 100);

  // Create Completed Session Record
  const newSessionRecord = {
    id: 'session_' + Date.now(),
    subject: activeSession.subject,
    topic: activeSession.topic,
    total: total,
    correct: activeSession.correct,
    wrong: activeSession.wrong,
    accuracy: accuracy,
    timestamp: Date.now()
  };

  // Add to global sessions list
  sessions.unshift(newSessionRecord);
  saveStorageData();

  // Show Modal Summary
  showSummaryModal(newSessionRecord);

  // Clear Active State
  resetSessionUI();
}

// Reset Session UI to Setup Form
function resetSessionUI() {
  activeSession = null;
  document.getElementById('start-form').reset();
  document.getElementById('setup-card').classList.remove('hidden');
  document.getElementById('active-session-card').classList.add('hidden');
}

// Display Modal Summary after Session Finish
function showSummaryModal(record) {
  document.getElementById('modal-subject-name').textContent = record.subject;
  document.getElementById('modal-topic-name').textContent = record.topic;
  document.getElementById('modal-total').textContent = record.total;
  document.getElementById('modal-correct').textContent = record.correct;
  document.getElementById('modal-wrong').textContent = record.wrong;
  document.getElementById('modal-accuracy').textContent = `${record.accuracy}%`;

  const badge = document.getElementById('modal-feedback-badge');
  if (record.accuracy >= 90) {
    badge.textContent = '🏆 Desempenho Excelente! Excelente domínio do assunto.';
    badge.style.background = 'rgba(16, 185, 129, 0.15)';
    badge.style.color = 'var(--success)';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  } else if (record.accuracy >= 75) {
    badge.textContent = '🚀 Muito Bom! Ótimo rendimento no assunto.';
    badge.style.background = 'rgba(56, 189, 248, 0.15)';
    badge.style.color = 'var(--primary)';
    badge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
  } else if (record.accuracy >= 50) {
    badge.textContent = '📚 Bom progresso! Recomendada revisão complementar.';
    badge.style.background = 'rgba(245, 158, 11, 0.15)';
    badge.style.color = 'var(--warning)';
    badge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
  } else {
    badge.textContent = '⚠️ Atenção! Recomendado focar no estudo teórico deste assunto.';
    badge.style.background = 'rgba(244, 63, 94, 0.15)';
    badge.style.color = 'var(--danger)';
    badge.style.borderColor = 'rgba(244, 63, 94, 0.4)';
  }

  document.getElementById('summary-modal').classList.remove('hidden');
}

function closeModalAndNewSession() {
  document.getElementById('summary-modal').classList.add('hidden');
  switchTab('session');
}

function closeModalAndGoHistory() {
  document.getElementById('summary-modal').classList.add('hidden');
  switchTab('history');
}

// Add Subject to recent list
function addRecentSubject(subject) {
  if (!subject) return;
  const normalized = subject.trim();
  recentSubjects = recentSubjects.filter(s => s.toLowerCase() !== normalized.toLowerCase());
  recentSubjects.unshift(normalized);
  if (recentSubjects.length > 8) recentSubjects.pop(); // Keep top 8
  saveStorageData();
  updateRecentSubjectsUI();
}

function updateRecentSubjectsUI() {
  const chipsContainer = document.getElementById('quick-subjects-chips');
  const wrapper = document.getElementById('quick-subjects-wrapper');
  const datalist = document.getElementById('recent-subjects-list');

  if (!chipsContainer || !datalist) return;

  // Datalist options
  datalist.innerHTML = recentSubjects.map(s => `<option value="${escapeHtml(s)}"></option>`).join('');

  if (recentSubjects.length === 0) {
    wrapper.classList.add('hidden');
    return;
  }

  wrapper.classList.remove('hidden');
  chipsContainer.innerHTML = recentSubjects.map(s => `
    <button type="button" class="chip-btn" onclick="selectPresetSubject('${escapeHtml(s)}')">
      ${escapeHtml(s)}
    </button>
  `).join('');
}

function selectPresetSubject(subject) {
  const subjectInput = document.getElementById('input-subject');
  if (subjectInput) {
    subjectInput.value = subject;
    document.getElementById('input-topic').focus();
  }
}

// ==========================================================================
// HISTORY & ANALYTICS (TAB 2)
// ==========================================================================

function setPeriodFilter(period) {
  currentFilterPeriod = period;
  
  // Update Filter Buttons UI
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.getAttribute('data-period') === period) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  updateHistoryView();
}

function getFilteredSessions() {
  const now = new Date();
  
  return sessions.filter(session => {
    const date = new Date(session.timestamp);

    if (currentFilterPeriod === 'today') {
      return (
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    } else if (currentFilterPeriod === 'week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      return date >= oneWeekAgo;
    } else if (currentFilterPeriod === 'month') {
      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    } else {
      return true; // 'all'
    }
  });
}

function updateHistoryView() {
  const filtered = getFilteredSessions();

  // 1. Render Summary Stats Cards
  renderOverviewCards(filtered);

  // 2. Render Chart
  renderChart(filtered);

  // 3. Render Subject Performance
  renderSubjectBreakdown(filtered);

  // 4. Render History List
  renderHistoryTimeline(filtered);
}

function renderOverviewCards(filteredSessions) {
  const totalQuestions = filteredSessions.reduce((acc, s) => acc + s.total, 0);
  const totalCorrect = filteredSessions.reduce((acc, s) => acc + s.correct, 0);
  const totalSessions = filteredSessions.length;
  const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  document.getElementById('stat-total-questions').textContent = totalQuestions;
  document.getElementById('stat-total-correct').textContent = totalCorrect;
  document.getElementById('stat-average-accuracy').textContent = `${avgAccuracy}%`;
  document.getElementById('stat-total-sessions').textContent = totalSessions;
}

function renderSubjectBreakdown(filteredSessions) {
  const container = document.getElementById('subject-performance-list');
  if (!container) return;

  if (filteredSessions.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Nenhum dado no período selecionado.</p></div>`;
    return;
  }

  // Group by Subject
  const subjectMap = {};
  filteredSessions.forEach(s => {
    if (!subjectMap[s.subject]) {
      subjectMap[s.subject] = { total: 0, correct: 0 };
    }
    subjectMap[s.subject].total += s.total;
    subjectMap[s.subject].correct += s.correct;
  });

  const subjectList = Object.keys(subjectMap).map(sub => {
    const data = subjectMap[sub];
    const acc = Math.round((data.correct / data.total) * 100);
    return { subject: sub, total: data.total, correct: data.correct, accuracy: acc };
  }).sort((a, b) => b.total - a.total);

  container.innerHTML = subjectList.map(item => {
    let barColor = 'var(--primary)';
    if (item.accuracy >= 80) barColor = 'var(--success)';
    else if (item.accuracy < 50) barColor = 'var(--danger)';
    else if (item.accuracy < 70) barColor = 'var(--warning)';

    return `
      <div class="subject-bar-item">
        <div class="subject-bar-info">
          <span class="subject-bar-name">${escapeHtml(item.subject)}</span>
          <span class="subject-bar-stats">${item.correct}/${item.total} (${item.accuracy}%)</span>
        </div>
        <div class="subject-progress-bg">
          <div class="subject-progress-fill" style="width: ${item.accuracy}%; background: ${barColor};"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderHistoryTimeline(filteredSessions) {
  const container = document.getElementById('history-items-container');
  if (!container) return;

  if (filteredSessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Nenhuma bateria de questões encontrada para o período selecionado.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredSessions.map(item => {
    const d = new Date(item.timestamp);
    const dateFormatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const timeFormatted = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let scoreClass = 'text-accent';
    if (item.accuracy >= 80) scoreClass = 'text-success';
    else if (item.accuracy < 50) scoreClass = 'text-danger';

    return `
      <div class="history-item">
        <div class="history-item-left">
          <div class="history-date-badge">
            <span class="history-date-day">${dateFormatted}</span>
            <span class="history-date-time">${timeFormatted}</span>
          </div>
          <div class="history-details">
            <h4>${escapeHtml(item.subject)}</h4>
            <p>${escapeHtml(item.topic)}</p>
          </div>
        </div>

        <div class="history-item-right">
          <div class="history-score-badge">
            <span class="history-score-val ${scoreClass}">${item.accuracy}%</span>
            <span class="history-score-ratio">${item.correct} / ${item.total} acertos</span>
          </div>
          <button class="btn-icon-delete" onclick="deleteHistoryItem('${item.id}')" title="Excluir Registro">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function deleteHistoryItem(id) {
  if (!confirm('Tem certeza que deseja excluir esta bateria do seu histórico?')) return;

  sessions = sessions.filter(s => s.id !== id);
  saveStorageData();
  updateHistoryView();
}

// Chart Rendering using Chart.js
function renderChart(filteredSessions) {
  const canvas = document.getElementById('performanceChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (chartInstance) {
    chartInstance.destroy();
  }

  if (filteredSessions.length === 0) {
    return;
  }

  // Aggregate by Date
  const dateMap = {};
  // Sort oldest first for chart
  const sorted = [...filteredSessions].sort((a, b) => a.timestamp - b.timestamp);

  sorted.forEach(s => {
    const d = new Date(s.timestamp);
    const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!dateMap[dateLabel]) {
      dateMap[dateLabel] = { total: 0, correct: 0 };
    }
    dateMap[dateLabel].total += s.total;
    dateMap[dateLabel].correct += s.correct;
  });

  const labels = Object.keys(dateMap);
  const totalData = labels.map(l => dateMap[l].total);
  const correctData = labels.map(l => dateMap[l].correct);
  const accuracyData = labels.map(l => Math.round((dateMap[l].correct / dateMap[l].total) * 100));

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Acertos',
          data: correctData,
          backgroundColor: 'rgba(0, 229, 117, 0.85)',
          borderRadius: 6,
        },
        {
          label: 'Total Feito',
          data: totalData,
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          borderColor: 'rgba(255, 255, 255, 0.25)',
          borderWidth: 1,
          borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } }
        },
        tooltip: {
          callbacks: {
            footer: (tooltipItems) => {
              const idx = tooltipItems[0].dataIndex;
              return `Aproveitamento: ${accuracyData[idx]}%`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        y: {
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          beginAtZero: true
        }
      }
    }
  });
}

// Export JSON Backup
function exportDataJSON() {
  if (sessions.length === 0) {
    alert('Não há baterias gravadas para exportar.');
    return;
  }
  const dataPayload = {
    version: 1,
    exportDate: new Date().toISOString(),
    sessions: sessions,
    recentSubjects: recentSubjects
  };
  const jsonStr = JSON.stringify(dataPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trajetoria_lite_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import JSON Backup
function importDataJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      let importedCount = 0;

      if (Array.isArray(data)) {
        data.forEach(s => {
          if (s.id && !sessions.some(existing => existing.id === s.id)) {
            sessions.push(s);
            importedCount++;
          }
        });
      } else if (data.sessions && Array.isArray(data.sessions)) {
        data.sessions.forEach(s => {
          if (s.id && !sessions.some(existing => existing.id === s.id)) {
            sessions.push(s);
            importedCount++;
          }
        });
        if (data.recentSubjects && Array.isArray(data.recentSubjects)) {
          data.recentSubjects.forEach(sub => addRecentSubject(sub));
        }
      }

      sessions.sort((a, b) => b.timestamp - a.timestamp);
      saveStorageData();
      updateHistoryView();

      alert(`Backup restaurado com sucesso! ${importedCount} novas baterias foram importadas.`);
    } catch (err) {
      alert('Erro ao ler o arquivo de backup. Certifique-se de escolher um arquivo .json válido.');
      console.error(err);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Export CSV Data
function exportDataCSV() {
  if (sessions.length === 0) {
    alert('Não há dados salvos para exportar.');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,ID;Data;Hora;Materia;Assunto;Total;Acertos;Erros;Aproveitamento_Percentual\n';

  sessions.forEach(s => {
    const d = new Date(s.timestamp);
    const dataStr = d.toLocaleDateString('pt-BR');
    const horaStr = d.toLocaleTimeString('pt-BR');
    const row = [
      s.id,
      dataStr,
      horaStr,
      `"${s.subject.replace(/"/g, '""')}"`,
      `"${s.topic.replace(/"/g, '""')}"`,
      s.total,
      s.correct,
      s.wrong,
      s.accuracy
    ].join(';');

    csvContent += row + '\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `trajetoria_lite_historico_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Keyboard Shortcuts Listener
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Only capture if active session card is active and visible
    const sessionCard = document.getElementById('active-session-card');
    if (!activeSession || sessionCard.classList.contains('hidden')) return;

    // Ignore keyboard shortcuts if user is typing inside an input/textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    const key = e.key.toLowerCase();

    if (key === 'a' || e.key === 'ArrowRight') {
      e.preventDefault();
      recordAnswer(true);
    } else if (key === 'e' || e.key === 'ArrowLeft') {
      e.preventDefault();
      recordAnswer(false);
    } else if (key === 'z' || (e.ctrlKey && key === 'z')) {
      e.preventDefault();
      undoLastAnswer();
    }
  });
}

// Utility to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// Legal Modals Handlers
function openPrivacyModal() {
  document.getElementById('privacy-modal').classList.remove('hidden');
}
function closePrivacyModal() {
  document.getElementById('privacy-modal').classList.add('hidden');
}
function openTermsModal() {
  document.getElementById('terms-modal').classList.remove('hidden');
}
function closeTermsModal() {
  document.getElementById('terms-modal').classList.add('hidden');
}

// PIX Donation Modal Handlers
function openPixModal() {
  document.getElementById('pix-modal').classList.remove('hidden');
}
function closePixModal() {
  document.getElementById('pix-modal').classList.add('hidden');
}

// Copy PIX Key with visual feedback
function copyPixKey() {
  const pixInput = document.getElementById('pix-key-input');
  if (!pixInput) return;

  navigator.clipboard.writeText(pixInput.value).then(() => {
    const copyBtnText = document.getElementById('btn-copy-pix-text');
    if (copyBtnText) {
      copyBtnText.textContent = 'Copiado! 🎉';
      setTimeout(() => {
        copyBtnText.textContent = 'Copiar';
      }, 2500);
    }
  }).catch(err => {
    // Fallback select
    pixInput.select();
    document.execCommand('copy');
    alert('Código PIX copiado!');
  });
}

// Copy Raw Random Key
function copyRawKey() {
  const rawKey = '532264dc-c4e7-45a3-9a90-dfcab44d054a';
  navigator.clipboard.writeText(rawKey).then(() => {
    alert('Chave aleatória copiada com sucesso!');
  }).catch(() => {
    prompt('Copie a chave aleatória abaixo:', rawKey);
  });
}

