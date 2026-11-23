(() => {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const screens = ['loadingScreen', 'errorScreen', 'teamSelectionScreen', 'workspaceScreen'];
  const state = {
    client: null,
    user: null,
    workshop: null,
    teams: [],
    team: null,
    locked: false,
    channel: null,
    saveTimers: new Map(),
    saveQueue: new Map(),
    answers: new Map()
  };

  const diagnosisFields = [
    { key: 'problem', label: '1. Как мы формулируем проблему?', hint: 'Опишите наблюдаемую проблему без объяснения причин.', full: true },
    { key: 'facts', label: '2. Подтверждённые факты', hint: 'Какие сведения подтверждены исходными данными?', full: true },
    { key: 'interpretations', label: '3. Интерпретации и допущения', hint: 'Какие выводы пока нельзя считать доказанными?' },
    { key: 'unknowns', label: '4. Что пока неизвестно?', hint: 'Каких данных или источников не хватает?' },
    { key: 'fishbone_people', label: '5А. Исикава — люди и роли', hint: 'Роли, ответственность, загрузка, компетенции.' },
    { key: 'fishbone_processes', label: '5Б. Исикава — методы и процессы', hint: 'Передача заказов, изменения приоритетов, эскалация.' },
    { key: 'fishbone_equipment', label: '5В. Исикава — оборудование', hint: 'Простои, ограничения мощности, доступность.' },
    { key: 'fishbone_materials', label: '5Г. Исикава — материалы', hint: 'Поставки, комплектность, готовность материалов.' },
    { key: 'fishbone_planning', label: '5Д. Исикава — планирование и данные', hint: 'Реалистичность сроков, загрузка, точность статусов.' },
    { key: 'fishbone_external', label: '5Е. Исикава — внешние факторы', hint: 'Заказчики, внешние ограничения, изменение требований.' },
    { key: 'ice', label: '6. Оценка ICE и приоритет', hint: 'Какие причины проверять первыми и почему?', full: true },
    { key: 'diagnostic_conclusion', label: '7. Заключение комиссии', hint: 'Что установлено, какие версии приоритетны и что необходимо выяснить дальше?', full: true }
  ];

  const experimentFields = [
    { key: 'hypothesis_if', label: '1. ЕСЛИ — какое действие?', hint: 'Что конкретно меняем? Кто и что будет делать?', full: true },
    { key: 'hypothesis_then', label: '2. ТО — какой результат?', hint: 'Метрика, исходное значение, целевой показатель и срок.', full: true },
    { key: 'hypothesis_because', label: '3. ПОТОМУ ЧТО — механизм', hint: 'Почему изменение должно повлиять на результат?', full: true },
    { key: 'baseline', label: '4. Baseline', hint: 'Текущее значение показателя и период измерения.' },
    { key: 'target_metric', label: '5. Метрика и целевое значение', hint: 'Что измеряем и какого результата ожидаем?' },
    { key: 'method', label: '6. Метод проверки / MVT', hint: 'Анализ записей, наблюдение, интервью, прототип, моделирование или пилот.', full: true },
    { key: 'budget_choice', label: '7. Выбор методов в рамках 80 единиц', hint: 'Какие методы выбираете и сколько условных единиц тратите?' },
    { key: 'scope_duration', label: '8. Масштаб и длительность', hint: 'Участок, смены, выборка, срок проверки.' },
    { key: 'success_criteria', label: '9. Критерии успеха', hint: 'Заранее заданный порог или диапазон результата.' },
    { key: 'failure_criteria', label: '10. Условие неуспеха', hint: 'При каком результате не масштабируем решение?' },
    { key: 'risks', label: '11. Риски и ограничения', hint: 'Ограничения, требования безопасности, возможные побочные эффекты.', full: true },
    { key: 'stop_rollback', label: '12. Stop-критерии и rollback', hint: 'Кто остановит тест и как вернёмся к исходному процессу?', full: true },
    { key: 'responsibles', label: '13. Ответственные и сроки', hint: 'Владелец эксперимента, исполнители и согласующие.' }
  ];

  function showScreen(id) {
    screens.forEach((screenId) => $(screenId).classList.toggle('hidden', screenId !== id));
  }

  function setConnection(text, ok = true) {
    const el = $('connectionStatus');
    el.innerHTML = `<span class="status-dot" style="background:${ok ? '#55c28b' : '#e6a63b'}"></span><span></span>`;
    el.querySelector('span:last-child').textContent = text;
  }

  function showError(message) {
    $('errorMessage').textContent = message;
    setConnection('Нет соединения', false);
    showScreen('errorScreen');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function ensureAnonymousSession() {
    const { data: sessionData, error: sessionError } = await state.client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session) {
      state.user = sessionData.session.user;
      return;
    }
    const { data, error } = await state.client.auth.signInAnonymously();
    if (error) throw error;
    state.user = data.user;
  }

  async function loadWorkshop() {
    const { data, error } = await state.client.rpc('get_workshop_teams', {
      p_join_code: CONFIG.WORKSHOP_CODE
    });
    if (error) throw error;
    if (!data || !data.workshop_id || !Array.isArray(data.teams)) {
      throw new Error('Не удалось получить список команд. Проверьте код занятия и настройки Supabase.');
    }
    state.workshop = { id: data.workshop_id, name: data.name, status: data.status };
    state.teams = data.teams;
    state.locked = data.status === 'locked';
  }

  function renderTeams() {
    const grid = $('teamGrid');
    grid.replaceChildren();
    state.teams.forEach((team, index) => {
      const button = document.createElement('button');
      button.className = 'team-card';
      button.type = 'button';
      button.innerHTML = `<span class="team-symbol">0${index + 1}</span><strong>${escapeHtml(team.name)}</strong><span>Открыть рабочую комнату →</span>`;
      button.addEventListener('click', () => joinTeam(team));
      grid.appendChild(button);
    });
  }

  async function joinTeam(team) {
    try {
      setConnection('Подключение к команде…');
      const { data, error } = await state.client.rpc('join_workshop', {
        p_join_code: CONFIG.WORKSHOP_CODE,
        p_team_id: team.id
      });
      if (error) throw error;
      state.team = { id: data.team_id, name: data.team_name };
      state.locked = data.status === 'locked';
      await openWorkspace();
    } catch (error) {
      showError(error.message || 'Не удалось войти в команду.');
    }
  }

  function parseAnswer(value) {
    if (value && typeof value === 'object' && typeof value.text === 'string') return value.text;
    if (typeof value === 'string') return value;
    return '';
  }

  function buildFields(containerId, fields) {
    const container = $(containerId);
    container.replaceChildren();
    fields.forEach((field) => {
      const card = document.createElement('article');
      card.className = `field-card${field.full ? ' full' : ''}`;
      const label = document.createElement('label');
      label.htmlFor = `field-${field.key}`;
      label.textContent = field.label;
      const hint = document.createElement('div');
      hint.className = 'field-hint';
      hint.textContent = field.hint;
      const textarea = document.createElement('textarea');
      textarea.id = `field-${field.key}`;
      textarea.dataset.fieldKey = field.key;
      textarea.placeholder = 'Введите ответ команды…';
      textarea.value = state.answers.has(field.key) ? state.answers.get(field.key) : '';
      textarea.disabled = state.locked;
      textarea.addEventListener('input', () => scheduleSave(field.key, textarea.value));
      card.append(label, hint, textarea);
      container.appendChild(card);
    });
  }

  async function loadAnswers() {
    const { data, error } = await state.client
      .from('team_answers')
      .select('task_key, field_key, answer, updated_at')
      .eq('workshop_id', state.workshop.id)
      .eq('team_id', state.team.id);
    if (error) throw error;
    state.answers.clear();
    (data || []).forEach((row) => state.answers.set(row.field_key, parseAnswer(row.answer)));
  }

  async function openWorkspace() {
    stopRealtime();
    state.saveTimers.forEach((timer) => clearTimeout(timer));
    state.saveTimers.clear();
    state.saveQueue.clear();
    await loadAnswers();
    $('workspaceTitle').textContent = state.team.name;
    $('workspaceSubtitle').textContent = state.workshop.name;
    $('lockedBanner').classList.toggle('hidden', !state.locked);
    buildFields('diagnosisFields', diagnosisFields);
    buildFields('experimentFields', experimentFields);
    setSaveState(state.locked ? 'Зафиксировано тренером' : 'Все изменения сохранены', 'saved');
    $('lastSavedAt').textContent = state.locked ? 'Режим только чтения' : 'Облачное автосохранение включено';
    showScreen('workspaceScreen');
    setConnection('Подключено');
    startRealtime();
    activateTab('diagnosisSection');
  }

  function activateTab(sectionId) {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.target === sectionId));
    $('diagnosisSection').classList.toggle('hidden', sectionId !== 'diagnosisSection');
    $('experimentSection').classList.toggle('hidden', sectionId !== 'experimentSection');
  }

  function setSaveState(text, mode) {
    const el = $('saveIndicator');
    el.className = `save-indicator${mode === 'pending' ? ' pending' : ''}${mode === 'error' ? ' error' : ''}`;
    el.querySelector('span').textContent = text;
  }

  function scheduleSave(fieldKey, value) {
    if (state.locked) return;
    state.answers.set(fieldKey, value);
    state.saveQueue.set(fieldKey, value);
    setSaveState('Сохраняем в облако…', 'pending');
    const existing = state.saveTimers.get(fieldKey);
    if (existing) clearTimeout(existing);
    state.saveTimers.set(fieldKey, setTimeout(() => saveField(fieldKey), 650));
  }

  async function saveField(fieldKey) {
    if (state.locked || !state.team || !state.user) return;
    const value = state.saveQueue.get(fieldKey);
    if (value === undefined) return;
    state.saveTimers.delete(fieldKey);
    try {
      const payload = {
        workshop_id: state.workshop.id,
        team_id: state.team.id,
        task_key: fieldKey.startsWith('fishbone_') ? 'diagnosis_ishikawa' : (diagnosisFields.some((f) => f.key === fieldKey) ? 'diagnosis' : 'experiment'),
        field_key: fieldKey,
        answer: { text: value },
        updated_by: state.user.id,
        updated_at: new Date().toISOString()
      };
      const { error } = await state.client
        .from('team_answers')
        .upsert(payload, { onConflict: 'team_id,task_key,field_key' });
      if (error) throw error;
      // Do not discard a newer value typed while this request was in flight.
      if (state.saveQueue.get(fieldKey) === value) {
        state.saveQueue.delete(fieldKey);
      }
      const timestamp = new Date();
      $('lastSavedAt').textContent = `Последнее сохранение: ${timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      if (state.saveQueue.size === 0 && state.saveTimers.size === 0) setSaveState('Все изменения сохранены', 'saved');
      return true;
    } catch (error) {
      console.error('Save error:', error);
      setSaveState('Не удалось сохранить — проверьте соединение', 'error');
      return false;
    }
  }

  function startRealtime() {
    if (!state.team) return;
    state.channel = state.client
      .channel(`team-answers-${state.team.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_answers', filter: `team_id=eq.${state.team.id}`
      }, (payload) => {
        const row = payload.new;
        if (!row || !row.field_key) return;
        const incoming = parseAnswer(row.answer);
        state.answers.set(row.field_key, incoming);
        const field = document.querySelector(`[data-field-key="${CSS.escape(row.field_key)}"]`);
        if (field && document.activeElement !== field && !state.saveQueue.has(row.field_key)) field.value = incoming;
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('Синхронизация активна');
      });
  }

  function stopRealtime() {
    if (state.channel) {
      state.client.removeChannel(state.channel);
      state.channel = null;
    }
  }

  async function switchTeam() {
    // Flush pending writes before switching to another room.
    state.saveTimers.forEach((timer) => clearTimeout(timer));
    state.saveTimers.clear();
    const keys = [...state.saveQueue.keys()];
    const results = await Promise.all(keys.map((key) => saveField(key)));
    if (results.some((ok) => !ok) || state.saveQueue.size > 0) {
      window.alert('Не все изменения удалось сохранить. Проверьте соединение и повторите попытку.');
      return;
    }
    stopRealtime();
    state.team = null;
    renderTeams();
    showScreen('teamSelectionScreen');
  }

  async function init() {
    try {
      if (!window.supabase || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_PUBLISHABLE_KEY ||
          CONFIG.SUPABASE_URL.includes('ВСТАВЬТЕ') || CONFIG.SUPABASE_PUBLISHABLE_KEY.includes('ВСТАВЬТЕ')) {
        throw new Error('Сначала заполните Project URL и Publishable key в файле config.js.');
      }
      state.client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      await ensureAnonymousSession();
      await loadWorkshop();
      renderTeams();
      showScreen('teamSelectionScreen');
      setConnection('Подключено');
    } catch (error) {
      console.error(error);
      showError(error.message || 'Не удалось подключиться к Supabase.');
    }
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.target));
  });
  $('switchTeamButton').addEventListener('click', switchTeam);
  $('retryButton').addEventListener('click', () => {
    showScreen('loadingScreen');
    init();
  });
  window.addEventListener('beforeunload', () => {
    stopRealtime();
  });

  init();
})();
