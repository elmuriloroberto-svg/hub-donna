/**
 * API Client para Donna Unha Hub Frontend
 * Substitui o objeto LOCAL para fazer requisições ao backend Express
 */

class DonnaAPIClient {
  constructor(baseURL = 'http://localhost:3001/api') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  async request(method, endpoint, body = null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, options);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.msg || `Erro ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  // AUTH
  async login(login, senha, role) {
    return this.request('POST', '/auth/login', { login, senha, role });
  }

  // USERS
  async getUsers() {
    return this.request('GET', '/users');
  }

  async createUser(login, senha, nome, role) {
    return this.request('POST', '/users', { login, senha, nome, role });
  }

  async updateUser(id, data) {
    return this.request('PUT', `/users/${id}`, data);
  }

  async deleteUser(id) {
    return this.request('DELETE', `/users/${id}`);
  }

  // CLIENTES
  async getClientes() {
    return this.request('GET', '/clientes');
  }

  async createCliente(data) {
    return this.request('POST', '/clientes', data);
  }

  async updateCliente(id, data) {
    return this.request('PUT', `/clientes/${id}`, data);
  }

  async deleteCliente(id) {
    return this.request('DELETE', `/clientes/${id}`);
  }

  // BOLETOS
  async getBoletoPagar() {
    return this.request('GET', '/boletos/pagar');
  }

  async getBoletoReceber() {
    return this.request('GET', '/boletos/receber');
  }

  async createBoletoPagar(data) {
    return this.request('POST', '/boletos/pagar', data);
  }

  async updateBoletoPagar(id, data) {
    return this.request('PUT', `/boletos/pagar/${id}`, data);
  }

  async deleteBoletoPagar(id) {
    return this.request('DELETE', `/boletos/pagar/${id}`);
  }

  // TASKS
  async getTasks() {
    return this.request('GET', '/tasks');
  }

  async createTask(data) {
    return this.request('POST', '/tasks', data);
  }

  async updateTask(id, data) {
    return this.request('PUT', `/tasks/${id}`, data);
  }

  async deleteTask(id) {
    return this.request('DELETE', `/tasks/${id}`);
  }

  // METAS
  async getMetas() {
    return this.request('GET', '/metas');
  }

  async createMeta(data) {
    return this.request('POST', '/metas', data);
  }

  async updateMeta(id, data) {
    return this.request('PUT', `/metas/${id}`, data);
  }

  // PROCESSOS
  async getProcessos() {
    return this.request('GET', '/processos');
  }

  async createProcesso(data) {
    return this.request('POST', '/processos', data);
  }

  async updateProcesso(id, data) {
    return this.request('PUT', `/processos/${id}`, data);
  }

  async deleteProcesso(id) {
    return this.request('DELETE', `/processos/${id}`);
  }

  // ENTREGAS
  async getEntregas() {
    return this.request('GET', '/entregas');
  }

  async getEntregasResumo() {
    return this.request('GET', '/entregas/resumo/uber');
  }

  async createEntrega(data) {
    return this.request('POST', '/entregas', data);
  }

  async deleteEntrega(id) {
    return this.request('DELETE', `/entregas/${id}`);
  }

  // FOLHA
  async getFolha() {
    return this.request('GET', '/folha');
  }

  async createFolha(data) {
    return this.request('POST', '/folha', data);
  }

  async deleteFolha(id) {
    return this.request('DELETE', `/folha/${id}`);
  }

  // CONFIG
  async getConfig() {
    return this.request('GET', '/config');
  }

  async saveConfig(key, value) {
    return this.request('POST', '/config', { key, value });
  }

  // DASHBOARD
  async getDashboard() {
    return this.request('GET', '/dashboard');
  }
}

// Instância global
const API = new DonnaAPIClient();
