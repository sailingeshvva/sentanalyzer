/**
 * app.js — UI controller for SentiLens (CSV upload + Quick Predict)
 */
(() => {
  /* ── DOM refs ── */
  const $dropZone     = document.getElementById('drop-zone');
  const $fileInput    = document.getElementById('file-input');
  const $fileInfo     = document.getElementById('file-info');
  const $fileName     = document.getElementById('file-name');
  const $fileMeta     = document.getElementById('file-meta');
  const $btnRemove    = document.getElementById('btn-remove-file');
  const $colMapping   = document.getElementById('column-mapping');
  const $colText      = document.getElementById('col-text');
  const $colId        = document.getElementById('col-id');
  const $previewSec   = document.getElementById('preview-section');
  const $previewCount = document.getElementById('preview-count');
  const $previewHead  = document.getElementById('preview-head');
  const $previewBody  = document.getElementById('preview-body');
  const $btnClassify  = document.getElementById('btn-classify');
  const $btnClear     = document.getElementById('btn-clear');
  const $btnDownload  = document.getElementById('btn-download-csv');
  const $errorBox     = document.getElementById('error-box');
  const $stats        = document.getElementById('stats-section');
  const $results      = document.getElementById('results-section');

  /* Quick Predict DOM refs */
  const $quickInput   = document.getElementById('quick-input');
  const $btnPredict   = document.getElementById('btn-predict');
  const $quickResult  = document.getElementById('quick-result');
  const $quickEmoji   = document.getElementById('quick-emoji');
  const $quickLabel   = document.getElementById('quick-label');
  const $quickConf    = document.getElementById('quick-confidence');
  const $quickConfFill= document.getElementById('quick-conf-fill');
  const $quickEcho    = document.getElementById('quick-text-echo');

  let parsedHeaders = [];
  let parsedRows    = [];     // array of arrays (raw CSV rows)
  let classifiedData = null;  // for CSV download

  /* ══════════════════════════════════════════════════════════════════════
     QUICK PREDICT
     ══════════════════════════════════════════════════════════════════════ */

  $btnPredict.addEventListener('click', runQuickPredict);

  // Enter key (without Shift) triggers predict
  $quickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runQuickPredict();
    }
  });

  async function runQuickPredict() {
    const text = $quickInput.value.trim();
    if (!text) {
      $quickResult.classList.add('hidden');
      return;
    }

    try {
      const response = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error('API error');
      const result = await response.json();
      renderQuickResult(text, result);
    } catch (e) {
      toast('Error: Could not connect to the backend server.');
    }
  }

  function renderQuickResult(text, result) {
    const { label, confidence } = result;

    // Emoji
    const emojis = { positive: '😊', neutral: '😐', negative: '😞' };
    $quickEmoji.textContent = emojis[label] || '😐';

    // Badge
    $quickLabel.className = `badge badge-${label}`;
    $quickLabel.innerHTML = `${sentimentIcon(label)} ${label}`;

    // Confidence
    $quickConf.textContent = `${(confidence * 100).toFixed(0)}% confidence`;

    // Confidence bar
    const colors = {
      positive: 'var(--positive)',
      neutral:  'var(--neutral)',
      negative: 'var(--negative)',
    };
    $quickConfFill.style.width = `${confidence * 100}%`;
    $quickConfFill.style.background = colors[label];

    // Text echo
    $quickEcho.textContent = `"${text.length > 100 ? text.slice(0, 100) + '…' : text}"`;

    // Result card border glow
    const inner = $quickResult.querySelector('.quick-result-inner');
    inner.className = `quick-result-inner result-${label}`;

    // Show with animation (re-trigger)
    $quickResult.classList.remove('hidden');
    inner.style.animation = 'none';
    $quickEmoji.style.animation = 'none';
    // Force reflow
    void inner.offsetHeight;
    inner.style.animation = '';
    $quickEmoji.style.animation = '';
  }

  /* ══════════════════════════════════════════════════════════════════════
     CSV PARSING
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * Parse CSV text into { headers: string[], rows: string[][] }
   * Handles quoted fields and commas within quotes.
   */
  function parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === '\n' && !inQuotes) {
        lines.push(current);
        current = '';
      } else if (ch === '\r' && !inQuotes) {
        // skip \r, \n will follow
      } else {
        current += ch;
      }
    }
    if (current.trim()) lines.push(current);

    if (lines.length === 0) return { headers: [], rows: [] };

    const splitRow = (line) => {
      const fields = [];
      let field = '';
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (q && line[i + 1] === '"') { field += '"'; i++; }
          else q = !q;
        } else if (c === ',' && !q) {
          fields.push(field.trim());
          field = '';
        } else {
          field += c;
        }
      }
      fields.push(field.trim());
      return fields;
    };

    const headers = splitRow(lines[0]);
    const rows = lines.slice(1).map(splitRow).filter(r => r.some(c => c !== ''));

    return { headers, rows };
  }

  /* ══════════════════════════════════════════════════════════════════════
     FILE HANDLING
     ══════════════════════════════════════════════════════════════════════ */

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showError('Please upload a .csv file.');
      return;
    }
    hideError();

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0 || rows.length === 0) {
        showError('The CSV file appears to be empty or malformed.');
        return;
      }

      parsedHeaders = headers;
      parsedRows = rows;

      // Show file info
      const sizeKB = (file.size / 1024).toFixed(1);
      $fileName.textContent = file.name;
      $fileMeta.textContent = `${rows.length} rows · ${sizeKB} KB`;
      $fileInfo.classList.remove('hidden');
      $dropZone.classList.add('hidden');

      // Populate column selectors
      populateColumnSelectors(headers);
      $colMapping.classList.remove('hidden');

      // Show preview
      showPreview(headers, rows);

      // Enable classify
      $btnClassify.disabled = false;
    };
    reader.readAsText(file);
  }

  function populateColumnSelectors(headers) {
    // Text column
    $colText.innerHTML = '';
    headers.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = h;
      $colText.appendChild(opt);
    });
    // Auto-select first column named "text" (case-insensitive)
    const textIdx = headers.findIndex(h => h.toLowerCase().includes('text'));
    if (textIdx !== -1) $colText.value = textIdx;

    // ID column
    $colId.innerHTML = '<option value="">— Auto-generate —</option>';
    headers.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = h;
      $colId.appendChild(opt);
    });
    // Auto-select first column named "id"
    const idIdx = headers.findIndex(h => h.toLowerCase() === 'id');
    if (idIdx !== -1) $colId.value = idIdx;
  }

  function showPreview(headers, rows) {
    const previewRows = rows.slice(0, 5);
    $previewCount.textContent = `(showing ${previewRows.length} of ${rows.length})`;

    $previewHead.innerHTML = '';
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      $previewHead.appendChild(th);
    });

    $previewBody.innerHTML = '';
    previewRows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = cell.length > 80 ? cell.slice(0, 80) + '…' : cell;
        tr.appendChild(td);
      });
      $previewBody.appendChild(tr);
    });

    $previewSec.classList.remove('hidden');
  }

  /* ══════════════════════════════════════════════════════════════════════
     DRAG & DROP
     ══════════════════════════════════════════════════════════════════════ */

  $dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    $dropZone.classList.add('drag-over');
  });
  $dropZone.addEventListener('dragleave', () => {
    $dropZone.classList.remove('drag-over');
  });
  $dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    $dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    handleFile(file);
  });

  // Click to browse
  $fileInput.addEventListener('change', () => {
    handleFile($fileInput.files[0]);
  });

  /* ══════════════════════════════════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════════════════════════════════ */

  // Remove file
  $btnRemove.addEventListener('click', resetUpload);

  // Clear all
  $btnClear.addEventListener('click', () => {
    resetUpload();
    hideResults();
    // Clear quick predict
    $quickInput.value = '';
    $quickResult.classList.add('hidden');
    pulse($btnClear);
  });

  function resetUpload() {
    parsedHeaders = [];
    parsedRows = [];
    classifiedData = null;
    $fileInput.value = '';
    $dropZone.classList.remove('hidden');
    $fileInfo.classList.add('hidden');
    $colMapping.classList.add('hidden');
    $previewSec.classList.add('hidden');
    $btnClassify.disabled = true;
    hideError();
  }

  /* ══════════════════════════════════════════════════════════════════════
     CLASSIFY
     ══════════════════════════════════════════════════════════════════════ */

  $btnClassify.addEventListener('click', async () => {
    hideError();
    if (parsedRows.length === 0) { showError('No data loaded.'); return; }

    const textColIdx = parseInt($colText.value, 10);
    const idColVal   = $colId.value;
    const useId      = idColVal !== '';
    const idColIdx   = useId ? parseInt(idColVal, 10) : -1;

    // Build rows payload
    const rows = [];
    parsedRows.forEach((row, i) => {
      const text = row[textColIdx] || '';
      const id   = useId ? (row[idColIdx] || i + 1) : i + 1;
      rows.push({ id, text });
    });

    $btnClassify.classList.add('loading');

    try {
      const response = await fetch('/api/process_payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });
      const output = await response.json();
      if (output.error) throw new Error(output.error);
      
      classifiedData = output.results;
      renderStats(output);
      renderTable(output.results);
    } catch (e) {
      showError(e.message || 'Error connecting to the backend server.');
    } finally {
      $btnClassify.classList.remove('loading');
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     DOWNLOAD CSV
     ══════════════════════════════════════════════════════════════════════ */

  $btnDownload.addEventListener('click', () => {
    if (!classifiedData || classifiedData.length === 0) return;

    const csvRows = ['id,text,sentiment,confidence'];
    classifiedData.forEach(r => {
      const text = '"' + String(r.text).replace(/"/g, '""') + '"';
      csvRows.push(`${r.id},${text},${r.label},${r.confidence}`);
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sentilens_results.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV downloaded!');
  });

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════ */

  function renderStats(output) {
    const { counts, meta } = output;
    const total = meta.total_labeled;
    document.querySelector('#stat-total .stat-value').textContent    = total;
    document.querySelector('#stat-positive .stat-value').textContent = counts.positive;
    document.querySelector('#stat-neutral .stat-value').textContent  = counts.neutral;
    document.querySelector('#stat-negative .stat-value').textContent = counts.negative;

    const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%';
    document.getElementById('bar-positive').style.width = pct(counts.positive);
    document.getElementById('bar-neutral').style.width  = pct(counts.neutral);
    document.getElementById('bar-negative').style.width = pct(counts.negative);

    show($stats);
  }

  function renderTable(results) {
    const tbody = document.getElementById('results-body');
    tbody.innerHTML = '';

    results.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.style.animationDelay = `${Math.min(i, 30) * 30}ms`;
      tr.classList.add('animate-in');

      const badgeClass = `badge-${r.label}`;
      const barColor = r.label === 'positive' ? 'var(--positive)'
                     : r.label === 'negative' ? 'var(--negative)'
                     : 'var(--neutral)';

      const displayText = r.text.length > 120 ? r.text.slice(0, 120) + '…' : r.text;

      tr.innerHTML = `
        <td style="white-space:nowrap;font-family:var(--mono);font-size:0.78rem;color:var(--text-dim)">${escapeHTML(String(r.id))}</td>
        <td>${escapeHTML(displayText)}</td>
        <td><span class="badge ${badgeClass}">${sentimentIcon(r.label)} ${r.label}</span></td>
        <td>
          <span style="font-family:var(--mono);font-size:0.78rem;margin-right:8px">${(r.confidence * 100).toFixed(0)}%</span>
          <span class="confidence-bar"><span class="confidence-fill" style="width:${r.confidence * 100}%;background:${barColor}"></span></span>
        </td>`;
      tbody.appendChild(tr);
    });

    show($results);
  }

  /* ── Utilities ── */
  function show(el) { el.classList.remove('hidden'); el.classList.add('animate-in'); }
  function hideResults() {
    [$stats, $results].forEach(el => el.classList.add('hidden'));
  }

  function showError(msg) { $errorBox.textContent = msg; $errorBox.classList.remove('hidden'); }
  function hideError()    { $errorBox.textContent = ''; $errorBox.classList.add('hidden'); }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sentimentIcon(label) {
    switch (label) {
      case 'positive': return '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="vertical-align:-1px"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 7c.8 1.2 2 1.8 2.5 1.8s1.7-.6 2.5-1.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><circle cx="4.2" cy="4.8" r="0.6" fill="currentColor"/><circle cx="7.8" cy="4.8" r="0.6" fill="currentColor"/></svg>';
      case 'negative': return '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="vertical-align:-1px"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 8.5c.8-1.2 2-1.8 2.5-1.8s1.7.6 2.5 1.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><circle cx="4.2" cy="4.8" r="0.6" fill="currentColor"/><circle cx="7.8" cy="4.8" r="0.6" fill="currentColor"/></svg>';
      default:         return '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="vertical-align:-1px"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><line x1="3.5" y1="7.5" x2="8.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><circle cx="4.2" cy="4.8" r="0.6" fill="currentColor"/><circle cx="7.8" cy="4.8" r="0.6" fill="currentColor"/></svg>';
    }
  }

  function pulse(el) {
    el.style.transform = 'scale(0.95)';
    setTimeout(() => { el.style.transform = ''; }, 150);
  }

  /* ── Toast ── */
  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

})();
