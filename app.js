(() => {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

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
    answers: new Map(),
    currentStep: 1,
    maxStep: 1
  };

  const steps = [
    { title: 'Служебная записка', description: 'Сначала определите, что именно является проблемой. Не ищите причину раньше времени.' },
    { title: 'Решение руководителя', description: 'Посмотрите, как руководитель объяснил ситуацию и какие действия предложил. Найдите предположения за решениями.' },
    { title: 'Факты и суждения', description: 'Разберите, где заканчиваются данные и начинаются отбор информации, интерпретации и выводы.' },
    { title: 'Диаграмма Исикавы', description: 'Перенесите известные факты в систему причин и добавьте версии, которые предстоит проверить.' },
    { title: 'Приоритизация ICE', description: 'Выберите, какое направление разумнее исследовать первым.' },
    { title: 'Формулировка гипотезы', description: 'Превратите выбранное направление в проверяемую гипотезу о решении.' },
    { title: 'MVT и безопасный тест', description: 'Спроектируйте минимальную проверку и заранее зафиксируйте критерии.' }
  ];

  const problemOptions = [
    { value: 'deadlines', title: 'Заказы систематически выполняются с нарушением сроков', note: 'Наблюдаемая проблема, которую подтверждают показатели.' },
    { value: 'discipline', title: 'Сотрудники недостаточно дисциплинированы', note: 'Оценочное объяснение, а не установленный факт.' },
    { value: 'statuses', title: 'Сотрудники поздно обновляют статусы', note: 'Наблюдаемый сигнал в части заказов, но не доказанная причина всех просрочек.' },
    { value: 'priorities', title: 'Часто меняются приоритеты', note: 'Фактор, который может влиять на проблему и требует проверки.' }
  ];

  const managerActions = [
    { key: 'manager_daily_reports', title: 'Ежедневные отчёты', action: 'Ввести ежедневную отчётность по каждому заказу.', question: 'Какое предположение стоит за этим решением?', hint: 'Например: информация о рисках появляется поздно, потому что сотрудники не сообщают о ней вовремя.' },
    { key: 'manager_approval', title: 'Согласование изменений приоритетов', action: 'Согласовывать любые изменения приоритетов с руководителем.', question: 'Какую причину руководитель предполагает?', hint: 'Что должно быть верным, чтобы согласование помогло?' },
    { key: 'manager_kpi', title: 'Персональные KPI', action: 'Ввести индивидуальные показатели соблюдения сроков.', question: 'Какое объяснение проблемы заложено в этом действии?', hint: 'На кого и на что руководитель возлагает ответственность?' },
    { key: 'manager_meetings', title: 'Ежедневные совещания', action: 'Проводить ежедневные совещания по статусам заказов.', question: 'Какой механизм улучшения предполагает руководитель?', hint: 'Почему частые встречи должны повлиять на сроки?' }
  ];

  const ladderItems = [
    { id: '01', text: 'За три месяца 18 из 60 заказов выполнены с нарушением срока.', correct: ['fact'], why: 'Это объективные числовые данные о заказах.' },
    { id: '02', text: 'Руководитель обратил внимание на 8 случаев позднего обновления статуса из 20.', correct: ['selection'], why: 'Сам показатель 8 из 20 — факт. Но фокус руководителя именно на нём — отбор части данных.' },
    { id: '03', text: 'Сотрудники не обновляют статусы, потому что безответственно относятся к работе.', correct: ['interpretation'], why: 'Факт позднего обновления соединён с оценочным объяснением поведения сотрудников.' },
    { id: '04', text: 'Вероятно, сотрудники не понимают важность своевременной информации.', correct: ['assumption'], why: 'Это возможная версия мотивации сотрудников, которая пока не подтверждена.' },
    { id: '05', text: 'Основная причина просрочек — недостаточная дисциплина.', correct: ['conclusion'], why: 'Это вывод о главной причине на основании ограниченного набора данных.' },
    { id: '06', text: 'Без постоянного контроля сотрудники не соблюдают сроки.', correct: ['belief'], why: 'Это обобщённое убеждение о том, как сотрудники ведут себя без контроля.' },
    { id: '07', text: 'Руководитель вводит ежедневные отчёты и персональные KPI.', correct: ['action'], why: 'Это управленческое действие, которое следует из сформированного вывода и убеждения.' },
    { id: '08', text: 'После утверждения недельного плана поступило 12 срочных поручений.', correct: ['fact'], why: 'В кейсе указано конкретное количество срочных поручений.' },
    { id: '09', text: 'Руководитель выделил позднее обновление статусов среди других факторов.', correct: ['selection'], why: 'Руководитель выбрал один фрагмент информации, оставив остальные факторы вне фокуса.' },
    { id: '10', text: 'Сотрудники не справляются с нагрузкой, потому что не умеют расставлять приоритеты.', correct: ['interpretation', 'assumption'], why: 'Это объяснение нагрузки через предполагаемый дефицит навыка. В ключе допускается интерпретация/допущение — попросите команду объяснить логику.' }
  ];

    const ladderOptions = [
    ['fact', 'Объективная реальность / факт'],
    ['selection', 'Отбор информации'],
    ['interpretation', 'Интерпретация'],
    ['assumption', 'Допущение'],
    ['conclusion', 'Вывод'],
    ['belief', 'Убеждение'],
    ['action', 'Действие']
  ];

  const fishboneCategories = [
    { key: 'people', title: 'Люди и роли', en: 'MAN', evidence: ['Сотрудники одновременно работают над несколькими заказами.', 'Руководители смен иногда узнают о проблемах поздно.'], prompts: ['Кто отвечает за статус заказа?', 'Хватает ли времени и доступа к информации?', 'Понятно ли распределены роли и ответственность?'] },
    { key: 'processes', title: 'Методы и процессы', en: 'METHOD', evidence: ['Сотрудники отмечают частые изменения приоритетов.'], prompts: ['Как передаются заказы между участниками?', 'Есть ли порядок изменения приоритетов?', 'Как и когда эскалируются риски?'] },
    { key: 'equipment', title: 'Оборудование', en: 'MACHINE', evidence: [], prompts: ['Были ли простои оборудования?', 'Совпадают ли ремонты с периодами задержек?', 'Есть ли ограничение мощности?'] },
    { key: 'materials', title: 'Материалы', en: 'MATERIAL', evidence: [], prompts: ['Готовы ли материалы к плановой дате?', 'Есть ли задержки поставок или некомплектность?'] },
    { key: 'planning', title: 'Планирование и измерение', en: 'MEASUREMENT', evidence: ['За три месяца просрочено 18 из 60 заказов: 25%, 30%, 35% по месяцам.', 'В 8 из 20 случаев статус обновлён после появления риска задержки.'], prompts: ['Реалистичны ли плановые сроки?', 'Учитывается ли фактическая загрузка?', 'Одинаково ли все определяют просрочку и риск?'] },
    { key: 'external', title: 'Внешние факторы', en: 'ENVIRONMENT', evidence: ['После утверждения недельного плана поступило 12 срочных поручений.'], prompts: ['Менялись ли требования заказчиков?', 'Какие внешние ограничения влияли на сроки?', 'Как срочные поручения влияют на уже утверждённый план?'] }
  ];

    const iceVersions = [
    { key: 'late_status', title: 'Риски задержек выявляются слишком поздно', sample: 'Пример тренера: 4 × 3 × 5 = 60' },
    { key: 'priority_changes', title: 'Изменения приоритетов нарушают последовательность заказов', sample: 'Пример тренера: 5 × 2 × 4 = 40' },
    { key: 'parallel_work', title: 'Параллельная работа над заказами увеличивает переключения', sample: 'Пример тренера: 5 × 2 × 3 = 30' }
  ];

  const methods = [
    { key: 'records', title: 'Анализ записей заказов', cost: 10 },
    { key: 'observation', title: 'Наблюдение на смене', cost: 20 },
    { key: 'interviews', title: 'Интервью с участниками', cost: 15 },
    { key: 'prototype', title: 'Ручной шаблон / прототип', cost: 25 },
    { key: 'modeling', title: 'Моделирование', cost: 20 },
    { key: 'pilot', title: 'Ограниченный пилот', cost: 45 }
  ];

  function showScreen(id) {
    ['loadingScreen', 'errorScreen', 'teamSelectionScreen', 'workspaceScreen'].forEach((screenId) => {
      $(screenId).classList.toggle('hidden', screenId !== id);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function setConnection(text, ok = true) {
    const el = $('connectionStatus');
    el.innerHTML = '<span class="status-dot"></span><span></span>';
    el.querySelector('span:last-child').textContent = text;
    el.querySelector('.status-dot').classList.toggle('offline', !ok);
  }

  function setSaveState(text, mode) {
    const el = $('saveIndicator');
    el.className = 'save-indicator ' + (mode || '');
    el.querySelector('span').textContent = text;
  }

  function showError(message) {
    $('errorMessage').textContent = message;
    setConnection('Нет соединения', false);
    showScreen('errorScreen');
  }

  function rawValue(key) {
    return state.answers.has(key) ? state.answers.get(key) : null;
  }

  function textValue(key) {
    const value = rawValue(key);
    if (typeof value === 'string') return value;
    if (value && typeof value.text === 'string') return value.text;
    return '';
  }

  function numberValue(key, fallback = '') {
    const value = textValue(key);
    return value === '' ? fallback : Number(value);
  }

  function parseAnswer(answer) {
    // Scalar answers are stored as {text: "..."}; structured objects
    // (Ishikawa causes, ICE ratings, selections) must remain objects.
    if (answer && typeof answer === 'object' && !Array.isArray(answer) &&
        typeof answer.text === 'string' && Object.keys(answer).every((key) => key === 'text')) {
      return answer.text;
    }
    return answer;
  }

    function taskKeyFor(fieldKey) {
    if (fieldKey === 'flow_stage') return 'progress';
    if (fieldKey === 'problem_choice') return 'problem_selection';
    if (fieldKey.startsWith('manager_')) return 'manager_decisions';
    if (fieldKey.startsWith('classify_') || fieldKey === 'facts_checked') return 'facts_sorting';
    if (fieldKey.startsWith('causes_')) return 'ishikawa';
    if (fieldKey.startsWith('cause_') || fieldKey.startsWith('causes_')) return 'ishikawa';
    if (fieldKey.startsWith('ice_')) return 'ice';
    if (fieldKey.startsWith('hypothesis_')) return 'hypothesis';
    if (fieldKey === 'method_selection') return 'mvt';
    if (fieldKey.startsWith('experiment_')) return 'experiment';
    return 'general';
  }

  function scheduleSave(fieldKey, value) {
    if (state.locked) return;
    state.answers.set(fieldKey, value);
    state.saveQueue.set(fieldKey, value);
    setSaveState('Сохраняем в облако…', 'pending');
    const existing = state.saveTimers.get(fieldKey);
    if (existing) clearTimeout(existing);
    state.saveTimers.set(fieldKey, setTimeout(() => saveField(fieldKey), 550));
  }

  async function saveField(fieldKey) {
    if (state.locked || !state.team || !state.user) return false;
    const value = state.saveQueue.get(fieldKey);
    if (value === undefined) return true;
    state.saveTimers.delete(fieldKey);
    try {
      const payload = {
        workshop_id: state.workshop.id,
        team_id: state.team.id,
        task_key: taskKeyFor(fieldKey),
        field_key: fieldKey,
        answer: value && typeof value === 'object' ? value : { text: String(value) },
        updated_by: state.user.id,
        updated_at: new Date().toISOString()
      };
      const { error } = await state.client
        .from('team_answers')
        .upsert(payload, { onConflict: 'team_id,task_key,field_key' });
      if (error) throw error;
      if (state.saveQueue.get(fieldKey) === value) state.saveQueue.delete(fieldKey);
      if (state.saveQueue.size === 0 && state.saveTimers.size === 0) {
        setSaveState('Все изменения сохранены', 'saved');
      }
      const now = new Date();
      $('lastSavedAt').textContent = 'Последнее сохранение: ' + now.toLocaleTimeString('ru-RU');
      return true;
    } catch (error) {
      console.error('Save error:', error);
      setSaveState('Не удалось сохранить — проверьте соединение', 'error');
      return false;
    }
  }

  async function flushQueue() {
    state.saveTimers.forEach((timer) => clearTimeout(timer));
    state.saveTimers.clear();
    const keys = Array.from(state.saveQueue.keys());
    const results = await Promise.all(keys.map((key) => saveField(key)));
    return results.every(Boolean) && state.saveQueue.size === 0;
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
    const { data, error } = await state.client.rpc('get_workshop_teams', { p_join_code: CONFIG.WORKSHOP_CODE });
    if (error) throw error;
    if (!data || !data.workshop_id || !Array.isArray(data.teams)) {
      throw new Error('Не удалось получить команды. Проверьте код занятия.');
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
      button.innerHTML = '<span class="team-symbol">0' + (index + 1) + '</span><strong>' + escapeHtml(team.name) + '</strong><span>Открыть рабочую комнату <b>→</b></span>';
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

  async function loadAnswers() {
    const { data, error } = await state.client
      .from('team_answers')
      .select('task_key, field_key, answer, updated_at')
      .eq('workshop_id', state.workshop.id)
      .eq('team_id', state.team.id);
    if (error) throw error;
    state.answers.clear();
    (data || []).forEach((row) => state.answers.set(row.field_key, parseAnswer(row.answer)));
    const savedStep = Number(textValue('flow_stage') || 1);
    state.maxStep = Math.min(steps.length, Math.max(1, savedStep));
    state.currentStep = state.maxStep;
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
    showScreen('workspaceScreen');
    renderCurrentStep();
    setConnection('Подключено');
    setSaveState(state.locked ? 'Результаты зафиксированы' : 'Все изменения сохранены', 'saved');
    $('lastSavedAt').textContent = state.locked ? 'Режим только чтение' : 'Облачное автосохранение включено';
    startRealtime();
  }

  function renderStepper() {
    const nav = $('stepNav');
    nav.replaceChildren();
    steps.forEach((step, index) => {
      const number = index + 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'step-nav-item' + (number === state.currentStep ? ' active' : '') + (number < state.currentStep ? ' completed' : '');
      button.disabled = number > state.maxStep;
      button.innerHTML = '<span class="step-nav-number">' + (number < state.currentStep ? '✓' : String(number).padStart(2, '0')) + '</span><span class="step-nav-label">' + escapeHtml(step.title) + '</span>';
      button.addEventListener('click', () => {
        if (number <= state.maxStep) {
          state.currentStep = number;
          renderCurrentStep();
        }
      });
      nav.appendChild(button);
    });
  }

  function renderCurrentStep() {
    const step = steps[state.currentStep - 1];
    $('stepTitle').textContent = step.title;
    $('stepDescription').textContent = step.description;
    renderStepper();

    const content = $('stepContent');
    if (state.currentStep === 1) content.innerHTML = renderProblemStep();
    if (state.currentStep === 2) content.innerHTML = renderManagerStep();
    if (state.currentStep === 3) content.innerHTML = renderFactsStep();
    if (state.currentStep === 4) content.innerHTML = renderFishboneStep();
    if (state.currentStep === 5) content.innerHTML = renderIceStep();
    if (state.currentStep === 6) content.innerHTML = renderHypothesisStep();
    if (state.currentStep === 7) content.innerHTML = renderExperimentStep();

    bindCurrentStep();
    $('prevStepButton').disabled = state.currentStep === 1;
    $('nextStepButton').textContent = state.currentStep === steps.length ? 'К завершению проекта' : 'Продолжить →';
    $('stepPosition').textContent = 'Этап ' + state.currentStep + ' из ' + steps.length;
    $('progressFill').style.width = (state.currentStep / steps.length * 100) + '%';
    $('lockedBanner').classList.toggle('hidden', !state.locked);
    if (state.locked) {
      content.querySelectorAll('input, textarea, select, button[data-edit], button[data-add-cause], button[data-remove-cause], #checkFactsButton').forEach((el) => { el.disabled = true; });
      $('nextStepButton').disabled = true;
    } else {
      $('nextStepButton').disabled = false;
    }
  }

  function renderProblemStep() {
    const selected = textValue('problem_choice');
    const custom = textValue('problem_custom');
    let html = '<div class="case-memo">';
    html += '<div class="memo-top"><span class="memo-stamp">СЛУЖЕБНАЯ ЗАПИСКА</span><span class="memo-number">№ 14/ПР · ВНУТРЕННИЙ ДОКУМЕНТ</span></div>';
    html += '<h3>О систематическом нарушении сроков выполнения заказов</h3>';
    html += '<p>За последние три месяца производственное подразделение регулярно нарушает сроки выполнения заказов. В результате задерживаются отгрузки, растёт количество претензий клиентов, сотрудники работают в авральном режиме.</p>';
    html += '<div class="memo-signature"><span>От: руководителя производственного подразделения</span><span>Кому: рабочей группе</span></div>';
    html += '<div class="memo-data-grid">';
    html += '<div><small>Месяц 1</small><strong>5 из 20</strong><em>25% просрочек</em></div>';
    html += '<div><small>Месяц 2</small><strong>6 из 20</strong><em>30% просрочек</em></div>';
    html += '<div><small>Месяц 3</small><strong>7 из 20</strong><em>35% просрочек</em></div>';
    html += '<div class="memo-data-total"><small>Всего за период</small><strong>18 из 60</strong><em>30% заказов</em></div>';
    html += '</div><div class="memo-ask"><strong>Поручение рабочей группе</strong><p>Сформулируйте главную проблему. Затем зафиксируйте свою первую версию причины и первое управленческое действие. Вернёмся к ним после изучения инструментов.</p></div></div>';
    html += '<section class="exercise-panel"><div class="exercise-kicker">Вопрос 01 · Что является проблемой?</div><h3>Выберите главную проблему</h3><p class="muted">Выберите формулировку, которая точнее всего описывает наблюдаемую ситуацию. Не подменяйте проблему предполагаемой причиной.</p>';
    problemOptions.forEach((option) => {
      html += '<label class="choice-card ' + (selected === option.value ? 'selected' : '') + '"><input type="radio" name="problemChoice" value="' + option.value + '" ' + (selected === option.value ? 'checked' : '') + '><span class="choice-radio"></span><span class="choice-copy"><strong>' + escapeHtml(option.title) + '</strong><small>' + escapeHtml(option.note) + '</small></span></label>';
    });
    html += '<label class="choice-card custom-choice ' + (selected === 'custom' ? 'selected' : '') + '"><input type="radio" name="problemChoice" value="custom" ' + (selected === 'custom' ? 'checked' : '') + '><span class="choice-radio"></span><span class="choice-copy"><strong>Своя формулировка</strong><small>Предложите вариант команды, если он отличается от списка.</small></span></label>';
    if (selected === 'custom') html += '<textarea class="standalone-textarea" data-field-key="problem_custom" placeholder="Сформулируйте главную проблему своими словами…">' + escapeHtml(custom) + '</textarea>';
    html += '</section>';
    html += '<section class="exercise-panel initial-reaction"><div class="exercise-kicker">Зафиксируйте первую реакцию команды</div><h3>Пока не проверяем, просто записываем</h3><p class="muted">Сохраните собственную логику до знакомства с инструментами. Позже вы сравните её с фактами и решениями руководителя.</p>';
    html += renderTextCard('team_initial_cause', '1. В чём, на ваш взгляд, причина?', 'Запишите первую версию команды. Причина пока не обязана быть доказанной.', textValue('team_initial_cause'), true);
    html += renderTextCard('team_initial_action', '2. Что вы предложили бы сделать?', 'Какое первое действие вы бы выбрали как руководитель?', textValue('team_initial_action'), true);
    html += renderTextCard('team_initial_evidence', '3. На какие данные вы опираетесь?', 'Укажите конкретные факты, которые поддерживают вашу версию. Если данных пока нет — так и напишите.', textValue('team_initial_evidence'), true);
    html += '</section>';
    return html;
  }

    function renderManagerStep() {
    const choice = problemOptions.find((option) => option.value === textValue('problem_choice'));
    const problemLabel = textValue('problem_choice') === 'custom'
      ? textValue('problem_custom')
      : (choice ? choice.title : 'Команда ещё не зафиксировала выбор');
    let html = '<div class="reveal-banner"><span class="reveal-icon">!</span><div><div class="eyebrow">Новая информация по делу</div><h3>Теперь сравните свою первую реакцию с решением руководителя</h3><p>Сначала команда сформулировала собственную версию. Теперь открывается реакция руководителя из кейса — пока не оценивайте её правильность, ищите предположения за каждым действием.</p></div></div>';
    html += '<div class="team-first-reaction"><div class="eyebrow">Что записала ваша команда на первом этапе</div><div class="first-reaction-grid">';
    html += '<div><small>Выбранная проблема</small><strong>' + escapeHtml(problemLabel || 'Не выбрана') + '</strong></div>';
    html += '<div><small>Первая версия причины</small><p>' + escapeHtml(textValue('team_initial_cause') || 'Не заполнено') + '</p></div>';
    html += '<div><small>Первое предложенное действие</small><p>' + escapeHtml(textValue('team_initial_action') || 'Не заполнено') + '</p></div>';
    html += '<div><small>Факты, на которые опиралась команда</small><p>' + escapeHtml(textValue('team_initial_evidence') || 'Не заполнено') + '</p></div>';
    html += '</div></div>';
    html += '<div class="manager-reveal-card"><div class="eyebrow">Решение руководителя из учебного кейса</div><h3>Руководитель решил, что основная проблема — недостаточная дисциплина сотрудников</h3><p>Он предложил четыре действия. Каждое из них опирается на своё предположение о том, как устроена проблема.</p></div>';
    html += '<div class="exercise-panel"><div class="exercise-kicker">Вопрос 02 · Какие причины и допущения стоят за мерами?</div><h3>Разберите каждое решение руководителя</h3><p class="muted">Запишите, какое объяснение проблемы и какое предположение заложены в каждом действии. Не нужно выбирать одну заранее известную причину: ваши ответы станут материалом для следующего этапа.</p><div class="manager-grid">';
    managerActions.forEach((item, index) => {
      html += '<article class="manager-card"><div class="manager-card-number">0' + (index + 1) + '</div><div class="eyebrow">Управленческое решение</div><h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.action) + '</p><label for="' + item.key + '">' + escapeHtml(item.question) + '</label><textarea id="' + item.key + '" data-field-key="' + item.key + '" placeholder="' + escapeHtml(item.hint) + '">' + escapeHtml(textValue(item.key)) + '</textarea></article>';
    });
    html += '</div><div class="manager-prompt"><strong>Соберите собственные версии причин</strong><p>Какие причины вы видите теперь, когда рассмотрели все четыре действия? Сохраните несколько возможных объяснений, а не только одну.</p><textarea data-field-key="manager_possible_causes" placeholder="Запишите причины, которые команда хочет проверить дальше…">' + escapeHtml(textValue('manager_possible_causes')) + '</textarea></div></div>';
    return html;
  }

    function renderFactsStep() {
    const checked = textValue('facts_checked') === 'yes';
    const answered = ladderItems.filter((item) => textValue('classify_' + item.id)).length;
    const correctCount = ladderItems.filter((item) => {
      const answer = textValue('classify_' + item.id);
      return answer && item.correct.includes(answer);
    }).length;

    let html = '<div class="ladder-intro"><div class="ladder-stat"><strong>10</strong><span>утверждений</span></div><div><h3>Поднимитесь по лестнице умозаключений</h3><p>Разложите высказывания по ступеням. Сначала ответьте самостоятельно, затем нажмите «Проверить ответы». Неверные варианты подсветятся красным, верные — зелёным.</p></div></div>';
    html += '<div class="classification-legend"><span>Объективная реальность</span><span>Отбор информации</span><span>Интерпретация</span><span>Допущение</span><span>Вывод</span><span>Убеждение</span><span>Действие</span></div>';
    html += '<div class="ladder-list">';
    ladderItems.forEach((item) => {
      const selected = textValue('classify_' + item.id);
      const correct = selected && item.correct.includes(selected);
      const rowClass = checked ? (correct ? 'is-correct' : 'is-wrong') : '';
      const chosenLabel = ladderOptions.find((pair) => pair[0] === selected);
      const correctLabels = item.correct.map((value) => ladderOptions.find((pair) => pair[0] === value)?.[1] || value);
      html += '<article class="ladder-card ' + rowClass + '"><div class="ladder-id">' + item.id + '</div><div class="ladder-statement">' + escapeHtml(item.text) + '</div><select data-field-key="classify_' + item.id + '" aria-label="Ступень высказывания" ' + (state.locked ? 'disabled' : '') + '><option value="">Выберите ступень…</option>';
      ladderOptions.forEach(([value, label]) => {
        html += '<option value="' + value + '" ' + (selected === value ? 'selected' : '') + '>' + escapeHtml(label) + '</option>';
      });
      html += '</select>';
      if (checked) {
        html += '<div class="ladder-feedback ' + (correct ? 'correct' : 'wrong') + '"><strong>' + (correct ? '✓ Верно' : '✕ Неверно') + '</strong><span>' + (correct ? 'Вы выбрали: ' + escapeHtml(chosenLabel ? chosenLabel[1] : '') : 'Правильный вариант: ' + escapeHtml(correctLabels.join(' / '))) + '</span><small>' + escapeHtml(item.why) + '</small></div>';
      }
      html += '</article>';
    });
    html += '</div>';
    html += '<div class="check-panel"><div><strong>' + (checked ? 'Результат проверки' : 'Проверьте классификацию') + '</strong><p>' + (checked ? 'Верных ответов: ' + correctCount + ' из 10. Красные карточки требуют пересмотра.' : 'Распределите утверждения и проверьте себя. Для разбора нужны все 10 ответов.') + '</p></div><button class="button ' + (checked ? 'secondary' : 'primary') + '" id="checkFactsButton" ' + (answered < 10 || state.locked ? 'disabled' : '') + '>' + (checked ? 'Обновить проверку' : 'Проверить ответы') + '</button></div>';
    html += '<div class="insight-strip"><strong>Важно:</strong> у одного высказывания могут быть две смысловые части. Для пункта 10 ключ допускает интерпретацию или допущение — команда должна объяснить свою логику.</div>';
    html += '<section class="own-ladder-panel"><div class="exercise-kicker">Теперь вернитесь к собственной версии</div><h3>Спуститесь по лестнице назад</h3><p class="muted">Посмотрите на свою первую реакцию в начале кейса. Не переписывайте её задним числом — разберите, как вы пришли к этому решению.</p>';
    html += '<div class="own-work-summary"><small>Первая версия причины</small><p>' + escapeHtml(textValue('team_initial_cause') || 'На первом этапе команда не записала причину.') + '</p><small>Первое предложенное действие</small><p>' + escapeHtml(textValue('team_initial_action') || 'На первом этапе команда не записала действие.') + '</p></div>';
    html += '<div class="hypothesis-grid">';
    html += renderTextCard('own_ladder_fact', 'Какие факты действительно подтверждают вашу версию?', 'Отделите наблюдаемые данные от объяснения.', textValue('own_ladder_fact'), false);
    html += renderTextCard('own_ladder_interpretation', 'Как вы интерпретировали эти факты?', 'Какой смысл или оценку вы добавили?', textValue('own_ladder_interpretation'), false);
    html += renderTextCard('own_ladder_assumption', 'Какое допущение вы приняли?', 'Что сочли верным, не проверив?', textValue('own_ladder_assumption'), false);
    html += renderTextCard('own_ladder_ignored', 'Какие данные могли упустить?', 'На что вы не обратили внимания, когда сформировали первую версию?', textValue('own_ladder_ignored'), false);
    html += '</div></section>';
    return html;
  }

    function makeCauseId() {
    return window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : 'cause-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function collectCauseItems() {
    const items = [];
    state.answers.forEach((value, key) => {
      if (key.startsWith('cause_') && value && typeof value === 'object') {
        if (value.status === 'deleted') return;
        items.push({
          id: value.id || key.slice(key.lastIndexOf('_') + 1),
          fieldKey: key,
          category: value.category || key.split('_')[1],
          text: value.text || '',
          status: value.status || 'hypothesis',
          sourceKey: value.sourceKey || null
        });
      } else if (key.startsWith('causes_') && value && Array.isArray(value.items)) {
        const category = key.slice('causes_'.length);
        value.items.forEach((item, index) => {
          if (item.status === 'deleted') return;
          items.push({
            id: item.id || 'legacy-' + category + '-' + index,
            fieldKey: key,
            category,
            text: item.text || '',
            status: item.status || 'hypothesis',
            sourceKey: item.sourceKey || null,
            legacy: true,
            legacyIndex: index
          });
        });
      }
    });
    return items.filter((item) => item.text.trim());
  }

  function collectPriorVersions() {
    const entries = [
      { key: 'team_initial_cause', title: 'Первая версия причины команды', text: textValue('team_initial_cause') },
      { key: 'manager_possible_causes', title: 'Возможные причины за решениями руководителя', text: textValue('manager_possible_causes') },
      { key: 'own_ladder_interpretation', title: 'Интерпретация команды', text: textValue('own_ladder_interpretation') },
      { key: 'own_ladder_assumption', title: 'Допущение команды', text: textValue('own_ladder_assumption') },
      { key: 'own_ladder_ignored', title: 'Данные, которые команда могла упустить', text: textValue('own_ladder_ignored') }
    ];
    managerActions.forEach((action) => {
      entries.push({ key: action.key, title: 'Предположение за решением «' + action.title + '»', text: textValue(action.key) });
    });
    const transferred = new Set(collectCauseItems().map((item) => item.sourceKey).filter(Boolean));
    return entries.filter((entry) => entry.text && entry.text.trim()).map((entry) => ({
      ...entry,
      transferred: transferred.has(entry.key)
    }));
  }

  function transferPriorVersion(sourceKey) {
    const source = collectPriorVersions().find((entry) => entry.key === sourceKey);
    if (!source || source.transferred) return;
    const select = $('stepContent').querySelector('[data-transfer-category="' + sourceKey + '"]');
    const category = select ? select.value : '';
    if (!category) {
      window.alert('Сначала выберите ветвь диаграммы, куда перенести эту версию.');
      return;
    }
    const id = makeCauseId();
    scheduleSave('cause_' + category + '_' + id, {
      id,
      category,
      text: source.text,
      status: 'hypothesis',
      sourceKey
    });
    renderCurrentStep();
  }

  function updateCause(id, patch) {
    const item = collectCauseItems().find((cause) => cause.id === id);
    if (!item) return;
    if (item.legacy) {
      const current = rawValue(item.fieldKey);
      const next = current && Array.isArray(current.items) ? current.items.slice() : [];
      next[item.legacyIndex] = { ...next[item.legacyIndex], ...patch };
      scheduleSave(item.fieldKey, { items: next });
    } else {
      const current = rawValue(item.fieldKey) || {};
      scheduleSave(item.fieldKey, { ...current, ...patch });
    }
  }

  function removeCauseItem(id) {
    const item = collectCauseItems().find((cause) => cause.id === id);
    if (!item) return;
    if (item.legacy) {
      const current = rawValue(item.fieldKey);
      const next = current && Array.isArray(current.items) ? current.items.slice() : [];
      next.splice(item.legacyIndex, 1);
      scheduleSave(item.fieldKey, { items: next });
    } else {
      const current = rawValue(item.fieldKey) || {};
      scheduleSave(item.fieldKey, { ...current, status: 'deleted' });
    }
    renderCurrentStep();
  }

  function addCause(category) {
    const input = $('stepContent').querySelector('[data-cause-input="' + category + '"]');
    const select = $('stepContent').querySelector('[data-cause-status="' + category + '"]');
    const text = input ? input.value.trim() : '';
    if (!text) {
      if (input) input.focus();
      return;
    }
    const id = makeCauseId();
    scheduleSave('cause_' + category + '_' + id, {
      id,
      category,
      text,
      status: select ? select.value : 'hypothesis'
    });
    renderCurrentStep();
  }

    function renderFishboneStep() {
    const chosenProblem = problemOptions.find((option) => option.value === textValue('problem_choice'));
    const problemText = textValue('problem_choice') === 'custom'
      ? (textValue('problem_custom') || 'Собственная формулировка команды')
      : (chosenProblem ? chosenProblem.title : '18 из 60 заказов за три месяца выполнены с нарушением срока');
    const priorVersions = collectPriorVersions();
    const allCauses = collectCauseItems();

    let html = '<div class="fishbone-intro"><div><div class="eyebrow">Системный анализ · 6 направлений</div><h3>Продолжите исследование собственной версии</h3><p>Ниже собраны ваши наработки с предыдущих этапов. Перенесите важные версии в подходящие ветви. Добавьте новые причины, если они появились в обсуждении.</p></div><div class="fishbone-status-legend"><span class="tag fact">Факт</span><span class="tag hypothesis">Предположение</span><span class="tag unknown">Неизвестно</span></div></div>';

    if (priorVersions.length) {
      html += '<section class="prior-work-panel"><div class="exercise-kicker">Наработки команды с предыдущих этапов</div><h3>Не начинайте анализ заново — используйте то, что уже сформулировали</h3><div class="prior-work-list">';
      priorVersions.forEach((entry) => {
        html += '<article class="prior-work-card"><div><small>' + escapeHtml(entry.title) + '</small><p>' + escapeHtml(entry.text) + '</p></div><div class="prior-work-actions"><select data-transfer-category="' + escapeHtml(entry.key) + '"><option value="">Выберите ветвь…</option>';
        fishboneCategories.forEach((cat) => {
          html += '<option value="' + cat.key + '">' + escapeHtml(cat.title) + '</option>';
        });
        html += '</select><button type="button" class="button ' + (entry.transferred ? 'secondary' : 'primary') + '" data-transfer-prior="' + escapeHtml(entry.key) + '" ' + (entry.transferred || state.locked ? 'disabled' : '') + '>' + (entry.transferred ? 'Перенесено' : 'Перенести в Исикаву') + '</button></div></article>';
      });
      html += '</div></section>';
    } else {
      html += '<div class="prior-work-empty">На предыдущих этапах команда пока не записала собственные версии. Можно начать с фактов и вопросов, уже представленных в диаграмме.</div>';
    }

    html += '<div class="fishbone-board"><svg class="fishbone-connectors" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="fishboneArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#d94b3d"/></marker></defs><path d="M38 350 L1000 350" stroke="#173047" stroke-width="7" stroke-linecap="round" marker-end="url(#fishboneArrow)"/><path d="M205 350 L145 115 M535 350 L535 115 M850 350 L925 115 M355 350 L290 585 M690 350 L690 585 M1035 350 L1090 585" stroke="#7e9aa8" stroke-width="4" stroke-linecap="round" fill="none"/></svg><div class="fishbone-grid">
    fishboneCategories.forEach((cat) => {
      const items = allCauses.filter((item) => item.category === cat.key);
      html += '<article class="fishbone-branch"><div class="branch-head"><span>' + escapeHtml(cat.en) + '</span><h4>' + escapeHtml(cat.title) + '</h4></div>';
      if (cat.evidence.length) {
        html += '<div class="branch-evidence"><small>Данные и сведения исходного кейса</small>';
        cat.evidence.forEach((fact) => { html += '<div class="evidence-chip"><i></i>' + escapeHtml(fact) + '</div>'; });
        html += '</div>';
      } else {
        html += '<div class="branch-evidence unknown-box"><small>Пока нет подтверждённых данных</small>';
        cat.prompts.slice(0, 2).forEach((prompt) => { html += '<div class="unknown-prompt">? ' + escapeHtml(prompt) + '</div>'; });
        html += '</div>';
      }

      html += '<div class="cause-list">';
      items.forEach((item) => {
        const label = item.status === 'fact' ? 'Факт' : item.status === 'unknown' ? 'Неизвестно' : 'Предположение';
        html += '<div class="cause-item editable-cause"><div class="cause-edit-main"><span class="tag ' + (item.status === 'fact' ? 'fact' : item.status === 'unknown' ? 'unknown' : 'hypothesis') + '">' + label + '</span><textarea data-cause-text="' + escapeHtml(item.id) + '" aria-label="Текст версии" ' + (state.locked ? 'disabled' : '') + '>' + escapeHtml(item.text) + '</textarea></div><div class="cause-edit-actions"><select data-cause-status-edit="' + escapeHtml(item.id) + '" ' + (state.locked ? 'disabled' : '') + '><option value="hypothesis" ' + (item.status === 'hypothesis' ? 'selected' : '') + '>Предположение</option><option value="fact" ' + (item.status === 'fact' ? 'selected' : '') + '>Факт</option><option value="unknown" ' + (item.status === 'unknown' ? 'selected' : '') + '>Неизвестно</option></select><button type="button" data-remove-cause="' + escapeHtml(item.id) + '" aria-label="Удалить версию" ' + (state.locked ? 'disabled' : '') + '>×</button></div></div>';
      });
      html += '</div><div class="cause-entry"><input type="text" data-cause-input="' + cat.key + '" placeholder="Добавить свою версию…" ' + (state.locked ? 'disabled' : '') + '><select data-cause-status="' + cat.key + '" ' + (state.locked ? 'disabled' : '') + '><option value="hypothesis">Предположение</option><option value="fact">Факт</option><option value="unknown">Неизвестно</option></select><button type="button" class="add-cause-button" data-add-cause="' + cat.key + '" ' + (state.locked ? 'disabled' : '') + '>+</button></div></article>';
    });
    html += '</div><div class="fishbone-problem"><span>ПРОБЛЕМА, КОТОРУЮ ВЫ ВЫБРАЛИ</span><strong>' + escapeHtml(problemText) + '</strong><small>Исходные данные: 18 из 60 заказов просрочены</small></div></div>';

    html += '<div class="fishbone-bottom-grid"><div class="fishbone-coach-note"><strong>Не путайте наличие факта с доказанной причиной</strong><p>Поздние статусы, срочные поручения и параллельная работа присутствуют в кейсе. Их влияние на просрочки необходимо проверить. Простои оборудования, задержки материалов и реалистичность сроков пока неизвестны.</p></div><div class="fishbone-own-summary"><strong>Сколько версий собрала команда</strong><b>' + allCauses.length + '</b><span>Во всех шести ветвях диаграммы</span></div></div>';
    return html;
  }

    function renderIceStep() {
    const candidates = collectCauseItems().filter((item) => item.status !== 'fact');
    const ratings = rawValue('ice_ratings') && typeof rawValue('ice_ratings') === 'object'
      ? rawValue('ice_ratings') : {};
    const primaryId = textValue('ice_primary_cause_id');

    let html = '<div class="ice-intro"><div><div class="eyebrow">Приоритизация собственных версий</div><h3>Какие причины из вашей Исикавы проверять первыми?</h3><p>Сюда автоматически попадают предположения и неизвестные факторы, которые команда добавила на предыдущем этапе. Оцените каждую выбранную версию по I, C и E.</p></div><div class="ice-formula">ICE = I × C × E</div></div>';

    if (!candidates.length) {
      html += '<div class="dynamic-empty"><strong>Пока нет версий для приоритизации.</strong><p>Вернитесь на этап «Диаграмма Исикавы» и добавьте хотя бы одну причину со статусом «Предположение» или «Неизвестно». Здесь появятся именно ваши варианты.</p><button type="button" class="button secondary" id="goFishboneButton">Вернуться к Исикаве</button></div>';
      return html;
    }

    html += '<div class="ice-dynamic-list">';
    candidates.forEach((item, index) => {
      const value = ratings[item.id] || {};
      const values = ['I', 'C', 'E'].map((part) => value[part] || '');
      const score = values.every((number) => number !== '' && Number(number) >= 1)
        ? values.reduce((total, number) => total * Number(number), 1) : '—';
      const category = fishboneCategories.find((cat) => cat.key === item.category);
      html += '<article class="ice-candidate ' + (primaryId === item.id ? 'primary-candidate' : '') + '"><div class="ice-candidate-top"><div><small>Версия ' + (index + 1) + ' · ' + escapeHtml(category ? category.title : 'Исикава') + '</small><strong>' + escapeHtml(item.text) + '</strong><span class="tag ' + (item.status === 'unknown' ? 'unknown' : 'hypothesis') + '">' + (item.status === 'unknown' ? 'Неизвестно' : 'Предположение') + '</span></div><label class="ice-primary-choice"><input type="radio" name="icePrimary" data-ice-primary value="' + escapeHtml(item.id) + '" ' + (primaryId === item.id ? 'checked' : '') + ' ' + (state.locked ? 'disabled' : '') + '><span>Выбрать для проверки</span></label></div>';
      html += '<div class="ice-ratings">';
      [['I','Impact · влияние'],['C','Confidence · уверенность'],['E','Ease · простота']].forEach(([part,label]) => {
        html += '<label><small>' + label + '</small><select data-ice-rank="' + escapeHtml(item.id) + '" data-rank-part="' + part + '" ' + (state.locked ? 'disabled' : '') + '><option value="">1–5</option>';
        for (let n = 1; n <= 5; n++) html += '<option value="' + n + '" ' + (Number(value[part]) === n ? 'selected' : '') + '>' + n + '</option>';
        html += '</select></label>';
      });
      html += '<div class="ice-result"><small>ICE</small><strong data-ice-score="' + escapeHtml(item.id) + '">' + score + '</strong></div></div></article>';
    });
    html += '</div>';

    const selectedCause = candidates.find((item) => item.id === primaryId);
    html += '<div class="ice-selected-summary"><div class="eyebrow">Направление, которое команда выбрала для дальнейшей работы</div><strong>' + escapeHtml(selectedCause ? selectedCause.text : 'Пока не выбрано') + '</strong><p>Выбор означает только приоритет исследования. Он не доказывает, что именно эта причина вызвала просрочки.</p></div>';
    html += renderTextCard('ice_reason', 'Почему вы выбрали это направление?', 'Обоснуйте оценки ICE и объясните, почему начинаете именно с этой версии.', textValue('ice_reason'), true);
    html += '<div class="ice-coach-example"><strong>Пример оценок из ключа тренера — только ориентир:</strong><span>Позднее выявление рисков: 4 × 3 × 5 = 60; изменение приоритетов: 5 × 2 × 4 = 40; параллельная работа: 5 × 2 × 3 = 30. Ваши оценки могут отличаться, если команда их обосновывает.</span></div>';
    return html;
  }

    function renderHypothesisStep() {
    const chosenCause = collectCauseItems().find((item) => item.id === textValue('ice_primary_cause_id'));
    let html = '<div class="hypothesis-callout"><div class="eyebrow">Конструктор гипотезы</div><h3>От выбранной причины — к проверяемому решению</h3><p>Вы не начинаете заново: используйте направление, которое ваша команда выбрала на Исикаве и ICE. Теперь сформулируйте действие, которое позволит проверить предположение.</p><div class="chosen-cause-link"><small>Выбранное командой направление</small><strong>' + escapeHtml(chosenCause ? chosenCause.text : 'Направление пока не выбрано') + '</strong></div></div>';
    html += '<div class="hypothesis-grid">';
    html += renderTextCard('hypothesis_if', 'ЕСЛИ · Что конкретно изменяем?', 'Действие, процесс и ответственный. Свяжите действие с выбранным направлением.', textValue('hypothesis_if'), true);
    html += renderTextCard('hypothesis_then', 'ТО · Какой результат ожидаем?', 'Метрика, baseline, целевое значение и срок.', textValue('hypothesis_then'), true);
    html += renderTextCard('hypothesis_because', 'ПОТОМУ ЧТО · Почему это сработает?', 'Механизм, связывающий действие и результат с выбранной версией.', textValue('hypothesis_because'), true);
    html += renderTextCard('hypothesis_metric', 'Чем измерим?', 'Источник, выборка и период данных.', textValue('hypothesis_metric'), false);
    html += renderTextCard('hypothesis_alternatives', 'Какие есть альтернативные объяснения?', 'Что ещё может повлиять на показатель, кроме выбранного действия?', textValue('hypothesis_alternatives'), false);
    html += '</div>';
    const ifText = textValue('hypothesis_if') || '[действие]';
    const thenText = textValue('hypothesis_then') || '[ожидаемый результат]';
    const becauseText = textValue('hypothesis_because') || '[механизм влияния]';
    html += '<div class="hypothesis-preview"><small>Текущая формулировка команды</small><p>Если ' + escapeHtml(ifText) + ', то ' + escapeHtml(thenText) + ', потому что ' + escapeHtml(becauseText) + '.</p></div>';
    html += '<div class="popper-panel"><div><span class="eyebrow">Краш-тест по Попперу</span><h3>Что должно опровергнуть гипотезу?</h3><p>Если любой результат можно объяснить так, будто гипотеза всё равно верна, это не проверка, а защита идеи.</p></div>' + renderTextCard('hypothesis_falsification', 'Условие опровержения', 'Какой результат заставит команду признать, что ожидание не сбылось?', textValue('hypothesis_falsification'), true) + '</div>';
    return html;
  }

    function renderExperimentStep() {
    const chosenCause = collectCauseItems().find((item) => item.id === textValue('ice_primary_cause_id'));
    const hypothesisPreview = 'Если ' + (textValue('hypothesis_if') || '[действие не указано]') + ', то ' + (textValue('hypothesis_then') || '[результат не указан]') + ', потому что ' + (textValue('hypothesis_because') || '[механизм не указан]') + '.';
    let html = '<div class="mvt-intro"><div class="eyebrow">Safe-to-fail · MVT</div><h3>Проверьте решение, которое вы сами спроектировали</h3><p>Не начинайте новый кейс. Выбранное направление и формулировка гипотезы переносятся сюда автоматически. Спроектируйте минимальную и безопасную проверку.</p><div class="mvt-chain"><div><small>Ваше направление</small><strong>' + escapeHtml(chosenCause ? chosenCause.text : 'Не выбрано') + '</strong></div><div><small>Ваша гипотеза</small><strong>' + escapeHtml(hypothesisPreview) + '</strong></div></div></div>';
    html += '<div class="experiment-layout"><div class="exercise-panel"><h3>Выберите методы проверки</h3><p class="muted">Бюджет команды — 80 условных единиц. Можно выбрать один метод или комбинацию.</p><div class="method-list">';
    const selectedValue = rawValue('method_selection');
    const selectedMethods = selectedValue && Array.isArray(selectedValue.methods) ? selectedValue.methods : [];
    methods.forEach((method) => {
      html += '<label class="method-option"><input type="checkbox" data-method="' + method.key + '" ' + (selectedMethods.includes(method.key) ? 'checked' : '') + '><span>' + escapeHtml(method.title) + '</span><b>' + method.cost + '</b></label>';
    });
    html += '</div><div class="budget-total"><span>Использовано бюджета</span><strong id="budgetTotal">0 / 80</strong></div><div id="budgetWarning" class="budget-warning hidden">Бюджет превышен. Пересмотрите комбинацию методов.</div></div>';
    html += '<div class="exercise-panel"><h3>План безопасного эксперимента</h3>';
    html += renderTextCard('experiment_scope', 'Где тестируем?', 'Участок, подразделение или смена.', textValue('experiment_scope'), false);
    html += renderTextCard('experiment_sample', 'На какой выборке?', 'В учебном примере — следующие 20 сопоставимых заказов.', textValue('experiment_sample'), false);
    html += renderTextCard('experiment_duration', 'Сколько длится тест?', 'В учебном примере — четыре недели.', textValue('experiment_duration'), false);
    html += renderTextCard('experiment_action', 'Что именно делаем?', 'Например, 10-минутный разбор заказов с риском задержки и фиксация препятствия, ответственного и ближайшего шага.', textValue('experiment_action'), true);
    html += renderTextCard('experiment_do_not_change', 'Что не меняем?', 'Технологию, режимы, обязательные процедуры, требования безопасности и качества.', textValue('experiment_do_not_change'), true);
    html += renderTextCard('experiment_success', 'Критерии успеха', 'Какие пороги фиксируем до начала проверки?', textValue('experiment_success'), true);
    html += renderTextCard('experiment_failure', 'Критерии неуспеха', 'При каком результате не масштабируем решение?', textValue('experiment_failure'), true);
    html += renderTextCard('experiment_stop', 'Stop-критерии', 'При каком сигнале тест немедленно прекращается?', textValue('experiment_stop'), false);
    html += renderTextCard('experiment_rollback', 'Rollback', 'Кто останавливает тест и как команда возвращается к исходному процессу?', textValue('experiment_rollback'), false);
    html += renderTextCard('experiment_owner', 'Ответственные и согласующие', 'Владелец эксперимента, исполнитель и необходимые согласующие.', textValue('experiment_owner'), false);
    html += '</div></div>';
    html += '<div class="safe-note"><strong>Безопасность не является предметом эксперимента.</strong><span>Ни одна гипотеза не отменяет обязательные требования охраны труда, промышленной безопасности и качества. Фактический запуск в производстве требует согласований по правилам организации.</span></div>';
    return html;
  }

  function bindCurrentStep() {
    const content = $('stepContent');
    content.querySelectorAll('[data-field-key]').forEach((el) => {
      el.addEventListener('input', () => {
        scheduleSave(el.dataset.fieldKey, el.value);
        if (el.dataset.fieldKey.startsWith('hypothesis_')) updateHypothesisPreview();
      });
      el.addEventListener('change', () => {
        scheduleSave(el.dataset.fieldKey, el.value);
        updateIceScores();
      });
    });

    content.querySelectorAll('input[name="problemChoice"]').forEach((el) => {
      el.addEventListener('change', () => {
        scheduleSave('problem_choice', el.value);
        const cards = content.querySelectorAll('.choice-card');
        cards.forEach((card) => card.classList.toggle('selected', card.querySelector('input').checked));
        if (el.value === 'custom') renderCurrentStep();
      });
    });

    const checkButton = $('checkFactsButton');
    if (checkButton) {
      checkButton.addEventListener('click', () => {
        scheduleSave('facts_checked', 'yes');
        saveField('facts_checked').then(() => renderCurrentStep());
      });
    }

    content.querySelectorAll('[data-add-cause]').forEach((button) => {
      button.addEventListener('click', () => addCause(button.dataset.addCause));
    });
    content.querySelectorAll('[data-transfer-prior]').forEach((button) => {
      button.addEventListener('click', () => transferPriorVersion(button.dataset.transferPrior));
    });
    content.querySelectorAll('[data-remove-cause]').forEach((button) => {
      button.addEventListener('click', () => removeCauseItem(button.dataset.removeCause));
    });
    content.querySelectorAll('[data-cause-text]').forEach((el) => {
      el.addEventListener('input', () => updateCause(el.dataset.causeText, { text: el.value }));
    });
    content.querySelectorAll('[data-cause-status-edit]').forEach((el) => {
      el.addEventListener('change', () => updateCause(el.dataset.causeStatusEdit, { status: el.value }));
    });
    content.querySelectorAll('[data-ice-rank]').forEach((el) => {
      el.addEventListener('change', () => updateIceRank(el.dataset.iceRank, el.dataset.rankPart, el.value));
    });
    content.querySelectorAll('[data-ice-primary]').forEach((el) => {
      el.addEventListener('change', () => {
        scheduleSave('ice_primary_cause_id', el.value);
        renderCurrentStep();
      });
    });
    const fishboneButton = $('goFishboneButton');
    if (fishboneButton) fishboneButton.addEventListener('click', () => { state.currentStep = 4; renderCurrentStep(); });

    content.querySelectorAll('[data-field-key^="classify_"]').forEach((el) => {
      el.addEventListener('change', () => {
        if (textValue('facts_checked') === 'yes') {
          scheduleSave('facts_checked', 'no');
          window.setTimeout(() => renderCurrentStep(), 0);
        }
      });
    });

    content.querySelectorAll('[data-method]').forEach((el) => {
      el.addEventListener('change', updateMethodSelection);
    });
    updateIceScores();
    updateBudgetTotal();
  }

  function updateHypothesisPreview() {
    const preview = $('stepContent').querySelector('.hypothesis-preview p');
    if (!preview) return;
    preview.textContent = 'Если ' + (textValue('hypothesis_if') || '[действие]') + ', то ' + (textValue('hypothesis_then') || '[ожидаемый результат]') + ', потому что ' + (textValue('hypothesis_because') || '[механизм влияния]') + '.';
  }

  function updateIceScores() {
    const ratings = rawValue('ice_ratings') && typeof rawValue('ice_ratings') === 'object'
      ? rawValue('ice_ratings') : {};
    collectCauseItems().filter((item) => item.status !== 'fact').forEach((item) => {
      const value = ratings[item.id] || {};
      const vals = ['I', 'C', 'E'].map((part) => Number(value[part] || 0));
      const target = $('stepContent').querySelector('[data-ice-score="' + CSS.escape(item.id) + '"]');
      if (target) target.textContent = vals.every((number) => number >= 1) ? String(vals.reduce((a, b) => a * b, 1)) : '—';
    });
  }

  function updateIceRank(id, part, value) {
    const current = rawValue('ice_ratings') && typeof rawValue('ice_ratings') === 'object'
      ? rawValue('ice_ratings') : {};
    const next = { ...current, [id]: { ...(current[id] || {}), [part]: Number(value) } };
    scheduleSave('ice_ratings', next);
    updateIceScores();
  }

    function updateMethodSelection() {
    const selected = Array.from($('stepContent').querySelectorAll('[data-method]:checked')).map((el) => el.dataset.method);
    scheduleSave('method_selection', { methods: selected });
    updateBudgetTotal();
  }

  function updateBudgetTotal() {
    const target = $('budgetTotal');
    if (!target) return;
    const selected = Array.from($('stepContent').querySelectorAll('[data-method]:checked')).map((el) => el.dataset.method);
    const total = methods.filter((method) => selected.includes(method.key)).reduce((sum, method) => sum + method.cost, 0);
    target.textContent = total + ' / 80';
    const warning = $('budgetWarning');
    if (warning) warning.classList.toggle('hidden', total <= 80);
  }

  async function advanceStep() {
    if (state.currentStep === 1 && (!textValue('problem_choice') ||
        (textValue('problem_choice') === 'custom' && !textValue('problem_custom').trim()))) {
      window.alert('Выберите или сформулируйте главную проблему.');
      return;
    }
    if (state.currentStep === 5) {
      const selectedId = textValue('ice_primary_cause_id');
      const candidates = collectCauseItems().filter((item) => item.status !== 'fact');
      if (!selectedId || !candidates.some((item) => item.id === selectedId)) {
        window.alert('Выберите для проверки одну из собственных версий, добавленных на диаграмму Исикавы.');
        return;
      }
    }
    if (state.currentStep === 5) {
      const selectedId = textValue('ice_primary_cause_id');
      const candidates = collectCauseItems().filter((item) => item.status !== 'fact');
      if (!selectedId || !candidates.some((item) => item.id === selectedId)) {
        window.alert('Выберите для проверки одну из собственных версий, добавленных на диаграмму Исикавы.');
        return;
      }
    }
    const flushed = await flushQueue();
    if (!flushed) {
      window.alert('Не удалось сохранить все изменения. Проверьте соединение и повторите попытку.');
      return;
    }
    if (state.currentStep < steps.length) {
      state.currentStep += 1;
      state.maxStep = Math.max(state.maxStep, state.currentStep);
      state.answers.set('flow_stage', String(state.maxStep));
      state.saveQueue.set('flow_stage', String(state.maxStep));
      setSaveState('Сохраняем этап…', 'pending');
      const saved = await saveField('flow_stage');
      if (!saved) {
        window.alert('Этап не удалось сохранить. Проверьте соединение.');
        return;
      }
      renderCurrentStep();
    } else {
      window.alert('План эксперимента подготовлен. Перед реальным запуском его необходимо согласовать в соответствии с правилами производства.');
    }
  }

  async function switchTeam() {
    const flushed = await flushQueue();
    if (!flushed) {
      window.alert('Не все изменения удалось сохранить. Попробуйте ещё раз.');
      return;
    }
    stopRealtime();
    state.team = null;
    state.currentStep = 1;
    state.maxStep = 1;
    renderTeams();
    showScreen('teamSelectionScreen');
  }

  function startRealtime() {
    if (!state.team) return;
    state.channel = state.client
      .channel('team-answers-' + state.team.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_answers',
        filter: 'team_id=eq.' + state.team.id
      }, (payload) => {
        const row = payload.new;
        if (!row || !row.field_key) return;
        const incoming = parseAnswer(row.answer);
        state.answers.set(row.field_key, incoming);
        if (row.field_key === 'flow_stage') {
          const newMax = Math.min(steps.length, Math.max(1, Number(typeof incoming === 'string' ? incoming : incoming.text) || 1));
          state.maxStep = Math.max(state.maxStep, newMax);
          if (state.currentStep < newMax) {
            state.currentStep = newMax;
            renderCurrentStep();
          } else {
            renderStepper();
          }
          return;
        }
        const active = document.activeElement;
        const isEditing = active && $('stepContent').contains(active);
        if (!isEditing) renderCurrentStep();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('Командная синхронизация активна');
      });
  }

  function stopRealtime() {
    if (state.channel) {
      state.client.removeChannel(state.channel);
      state.channel = null;
    }
  }

  async function init() {
    try {
      if (!window.supabase || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_PUBLISHABLE_KEY ||
          CONFIG.SUPABASE_URL.includes('ВСТАВЬТЕ') || CONFIG.SUPABASE_PUBLISHABLE_KEY.includes('ВСТАВЬТЕ')) {
        throw new Error('Не заполнены параметры Supabase в config.js.');
      }
      state.client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      await ensureAnonymousSession();
      await loadWorkshop();

      const { data: membership, error: membershipError } = await state.client
        .from('team_memberships')
        .select('team_id')
        .eq('workshop_id', state.workshop.id)
        .eq('user_id', state.user.id)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (membership) {
        const previousTeam = state.teams.find((team) => team.id === membership.team_id);
        if (previousTeam) {
          state.team = { id: previousTeam.id, name: previousTeam.name };
          state.locked = state.workshop.status === 'locked';
          await openWorkspace();
          return;
        }
      }

      renderTeams();
      showScreen('teamSelectionScreen');
      setConnection('Подключено');
    } catch (error) {
      console.error(error);
      showError(error.message || 'Не удалось подключиться к Supabase.');
    }
  }

  $('switchTeamButton').addEventListener('click', switchTeam);
  $('prevStepButton').addEventListener('click', () => {
    if (state.currentStep > 1) {
      state.currentStep -= 1;
      renderCurrentStep();
    }
  });
  $('nextStepButton').addEventListener('click', advanceStep);
  $('retryButton').addEventListener('click', () => {
    showScreen('loadingScreen');
    init();
  });
  window.addEventListener('beforeunload', stopRealtime);

  init();
})();