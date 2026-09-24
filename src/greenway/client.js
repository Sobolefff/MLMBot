const config = require('../config');
const logger = require('../utils/logger');

// Kept deliberately low: on 2026-09-24 a handful of manual sync attempts in
// quick succession (well under what MAX_RETRIES=2 alone would produce) was
// enough to get the user's IPs temporarily blocked by Greenway. Retrying a
// failed request here is not free — treat every attempt as consuming budget
// against a real anti-bot system on someone's actual income-generating
// account, not a generic API to hammer through transient errors.
const MAX_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 2000;

/**
 * Thin, throttled wrapper over the JSON API that greenwayglobal.com's SPA
 * calls (pyapi.greenwaystart.com). All endpoints below were confirmed
 * manually via DevTools on 2026-09-24 — see memory `reference-greenway-pyapi`
 * for the recon notes (incl. the product catalog, order history, finances
 * and statement endpoints found in the second recon pass).
 *
 * One instance per partner token, since each request needs that partner's
 * bearer token and Greenway may rate-limit/flag per-account polling.
 */
class GreenwayClient {
  constructor(accessToken, { baseUrl = config.gwApiBaseUrl, minIntervalMs = config.gwRequestMinIntervalMs } = {}) {
    if (!accessToken) throw new Error('GreenwayClient requires an accessToken');
    this.accessToken = accessToken;
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.minIntervalMs = minIntervalMs;
    this.lastRequestAt = 0;
  }

  async _throttle() {
    const wait = this.minIntervalMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  _buildUrl(path, params = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
    return url;
  }

  async _get(path, params = {}) {
    return this._request(this._buildUrl(path, params), path);
  }

  async _request(url, pathForLogs = url.pathname) {
    await this._throttle();

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      this.lastRequestAt = Date.now();
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' },
        });
        if (res.status === 401) {
          throw Object.assign(new Error('Greenway access token expired or invalid'), { code: 'TOKEN_EXPIRED' });
        }
        if (res.status === 403 || res.status === 429) {
          // Possible rate-limit/anti-bot response — do not retry, this is
          // exactly the kind of request volume that got a real account's
          // IPs blocked on 2026-09-24. Surface it and let the caller decide
          // whether to back off entirely rather than hammering further.
          throw Object.assign(new Error(`Greenway API ${pathForLogs} returned ${res.status} (possible rate limit/block)`), {
            code: 'POSSIBLY_BLOCKED',
          });
        }
        if (!res.ok) {
          throw new Error(`Greenway API ${pathForLogs} returned ${res.status}`);
        }
        return await res.json();
      } catch (err) {
        lastError = err;
        if (err.code === 'TOKEN_EXPIRED' || err.code === 'POSSIBLY_BLOCKED') throw err;
        const willRetry = attempt < MAX_RETRIES;
        logger.error(willRetry ? 'Greenway API request failed, retrying' : 'Greenway API request failed, giving up', {
          path: pathForLogs,
          attempt,
          error: err.message,
          cause: err.cause ? `${err.cause.code || ''} ${err.cause.message || err.cause}`.trim() : undefined,
        });
        if (willRetry) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  // --- Общее / авторизация ---
  getMainSummary() {
    return this._get('greenway/main/');
  }

  getAuthInfo() {
    return this._get('auth/info/');
  }

  // --- Структура команды ---
  getPartnerList({ withFilterParams = 1, showAll = 0, sortBy = 'default', page = 1, perPage = 50 } = {}) {
    return this._get('greenway/office/partner/list/', {
      with_filter_params: withFilterParams,
      show_all: showAll,
      sort_by: sortBy,
      page,
      per_page: perPage,
    });
  }

  // --- Аналитика ПРО ---
  getPeriods() {
    return this._get('greenway/analytics-2/periods/');
  }

  getMainView(partnerId) {
    return this._get(`greenway/analytics-2/main-view/${partnerId}/`);
  }

  getProBonus(partnerId) {
    return this._get(`greenway/analytics-2/pro-bonus/${partnerId}/`);
  }

  getDynamicStructure(partnerId) {
    return this._get(`greenway/analytics-2/dynamic-structure/${partnerId}/`);
  }

  getFirstLineRegistrationsActivations(partnerId) {
    return this._get(`greenway/analytics-2/first-line-registrations-activations/${partnerId}/`);
  }

  getCumulativeSgoDynamics(partnerId, firstPeriod, secondPeriod) {
    return this._get(`greenway/analytics-2/cumulative-sgo-dynamics/${partnerId}/`, {
      first_period: firstPeriod,
      second_period: secondPeriod,
    });
  }

  getDailySgoDynamics(partnerId, firstPeriod, secondPeriod) {
    return this._get(`greenway/analytics-2/daily-sgo-dynamics/${partnerId}/`, {
      first_period: firstPeriod,
      second_period: secondPeriod,
    });
  }

  getRegistrations(partnerId, firstPeriod, secondPeriod) {
    return this._get(`greenway/analytics-2/registrations/${partnerId}/`, {
      first_period: firstPeriod,
      second_period: secondPeriod,
    });
  }

  getActivations(partnerId, firstPeriod, secondPeriod) {
    return this._get(`greenway/analytics-2/activations/${partnerId}/`, {
      first_period: firstPeriod,
      second_period: secondPeriod,
    });
  }

  getCountriesCities(partnerId, period) {
    return this._get(`greenway/analytics-2/countries-cities/${partnerId}/`, { period });
  }

  // --- Каталог товаров (для PV-Подборщика) ---
  /** Весь каталог одним запросом (без пагинации) — ~634 товара на момент разведки. */
  getShopProducts() {
    return this._get('greenway/shop/product/quick/');
  }

  /** Структура каталога: brands[], sections[] (категории), фильтры. */
  getShopMeta({ withStatic = false } = {}) {
    return this._get('greenway/shop/', withStatic ? { withStatic: 1 } : {});
  }

  // --- Мои заказы ---
  getOrderList(page = 1) {
    return this._get('greenway/office/order/list/', { page });
  }

  getOrderStatuses(orderIds = []) {
    const url = this._buildUrl('greenway/office/statement/user-orders-statuses/');
    for (const id of orderIds) url.searchParams.append('orderIds[]', id);
    return this._request(url, 'greenway/office/statement/user-orders-statuses/');
  }

  // --- Мои финансы ---
  getAccountList() {
    return this._get('greenway/office/account/list/');
  }

  getPayoutList() {
    return this._get('greenway/office/payout/list/');
  }

  getPayoutCompanyList() {
    return this._get('greenway/office/payout/company/list/');
  }

  // --- Стейтмент (расчёт вознаграждения) ---
  getStatement(periodId) {
    return this._get('greenway/office/statement/', { periodId });
  }

  getStatementCountriesStats(periodId) {
    return this._get('greenway/office/statement/user-countries-statistics/', { periodId });
  }

  getStatementTeamRevenue(periodId) {
    return this._get('greenway/office/statement/team-revenue/', { periodId });
  }

  // --- Dashboard / геймификация ---
  getDashboard() {
    return this._get('greenway/office/dashboard/');
  }

  getDashboardProGrade() {
    return this._get('greenway/office/dashboard/pro-grade/');
  }

  getDashboardTooFastTooFurious() {
    return this._get('greenway/office/dashboard/too-fast-too-furious/');
  }
}

module.exports = { GreenwayClient };
