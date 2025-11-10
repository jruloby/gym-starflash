// public/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const inputUser = document.getElementById('emailOrUsername');
  const inputPass = document.getElementById('password');
  const errorMsg = document.getElementById('error-msg');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorMsg) errorMsg.textContent = '';

    const emailOrUsername = inputUser.value.trim();
    const password = inputPass.value;

    if (!emailOrUsername || !password) {
      if (errorMsg) errorMsg.textContent = 'Completa todos los campos.';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername, password })
      });

      const data = await res.json();
      if (!res.ok) {
        if (errorMsg) errorMsg.textContent = data.error || 'Credenciales inválidas.';
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);

      if (data.role === 'admin') {
        window.location.href = '/admin.html';
      } else if (data.role === 'member') {
        window.location.href = '/member.html';
      } else {
        if (errorMsg) errorMsg.textContent = 'Rol desconocido.';
      }
    } catch (err) {
      console.error(err);
      if (errorMsg) errorMsg.textContent = 'Error al conectar con el servidor.';
    }
  });
});
