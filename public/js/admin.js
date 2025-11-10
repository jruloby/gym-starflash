// public/js/admin.js

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token || role !== 'admin') {
    window.location.href = '/';
    return;
  }

  // ELEMENTOS
  const logoutBtn = document.getElementById('logout-btn');
  const openModalBtn = document.getElementById('open-modal-btn');
  const createModal = document.getElementById('createModal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const createForm = document.getElementById('create-member-form');
  const errorMsg = document.getElementById('error-msg');

  const membersTableBody = document.querySelector('#membersTable tbody');
  const searchInput = document.getElementById('searchInput');

  const emptyProfile = document.getElementById('empty-profile');
  const profileCard = document.getElementById('member-profile');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileId = document.getElementById('profile-id');
  const profileCedula = document.getElementById('profile-cedula');
  const profileNombre = document.getElementById('profile-nombre');
  const profileEmail = document.getElementById('profile-email');
  const profileTelefono = document.getElementById('profile-telefono');
  const profilePlan = document.getElementById('profile-plan');
  const profileFechaInicio = document.getElementById('profile-fecha_inicio');
  const profileFechaVenc = document.getElementById('profile-fecha_vencimiento');
  const renewSelect = document.getElementById('renew-plan');
  const renewBtn = document.getElementById('renew-btn');
  const closeProfileBtn = document.getElementById('close-profile-btn');

  let allMembers = [];

  // SESIÓN
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = '/';
    });
  }

  // MODAL
  function openCreateModal() {
    if (createModal) createModal.style.display = 'block';
  }

  function closeCreateModal() {
    if (createModal) createModal.style.display = 'none';
    if (createForm) createForm.reset();
    if (errorMsg) errorMsg.textContent = '';
  }

  if (openModalBtn) openModalBtn.addEventListener('click', openCreateModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeCreateModal);
  window.addEventListener('click', (e) => {
    if (e.target === createModal) closeCreateModal();
  });

  // CREAR MIEMBRO
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorMsg) errorMsg.textContent = '';

      const cedula = document.getElementById('cedula').value.trim();
      const nombre = document.getElementById('nombre').value.trim();
      const email = document.getElementById('email').value.trim();
      const telefono = document.getElementById('telefono').value.trim();
      const password = document.getElementById('password').value;
      const plan = document.getElementById('plan').value;
      const avatar = document.getElementById('avatar').files[0];

      if (!cedula || !nombre || !password || !plan) {
        errorMsg.textContent =
          'Cédula, nombre, contraseña y plan son obligatorios.';
        return;
      }

      const formData = new FormData();
      formData.append('cedula', cedula);
      formData.append('nombre', nombre);
      formData.append('email', email);
      formData.append('telefono', telefono);
      formData.append('password', password);
      formData.append('plan', plan);
      if (avatar) formData.append('avatar', avatar);

      try {
        const res = await fetch('/api/admin/members', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: formData
        });
        const data = await res.json();
        console.log('CREAR MIEMBRO:', res.status, data);

        if (!res.ok) {
          errorMsg.textContent = data.error || 'Error al crear miembro.';
          return;
        }

        closeCreateModal();
        fetchMembers();
      } catch (err) {
        console.error(err);
        errorMsg.textContent = 'Error al conectar con el servidor.';
      }
    });
  }

  // LISTAR
  async function fetchMembers() {
    membersTableBody.innerHTML =
      '<tr><td colspan="8">Cargando...</td></tr>';

    try {
      const res = await fetch('/api/admin/members', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Error al obtener miembros');

      allMembers = await res.json();
      displayMembers(allMembers);
    } catch (err) {
      console.error(err);
      membersTableBody.innerHTML =
        '<tr><td colspan="8">No se pudo cargar la lista.</td></tr>';
    }
  }

  function displayMembers(members) {
    membersTableBody.innerHTML = '';

    if (!members.length) {
      membersTableBody.innerHTML =
        '<tr><td colspan="8">Sin miembros registrados.</td></tr>';
      return;
    }

    members.forEach((m) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.id}</td>
        <td>${m.cedula || ''}</td>
        <td>${m.nombre || ''}</td>
        <td>${m.email || ''}</td>
        <td>${m.telefono || ''}</td>
        <td>${m.plan || ''}</td>
        <td>${m.fecha_vencimiento || ''}</td>
        <td>
          <button class="view-btn" data-id="${m.id}">Ver</button>
          <button class="delete-btn" data-id="${m.id}">Eliminar</button>
        </td>
      `;
      membersTableBody.appendChild(tr);
    });

    document.querySelectorAll('.view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) viewMemberProfile(id);
      });
    });

    document.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) deleteMember(id);
      });
    });
  }

  // FILTRO
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = allMembers.filter((m) => {
        const n = (m.nombre || '').toLowerCase();
        const c = (m.cedula || '').toLowerCase();
        const e = (m.email || '').toLowerCase();
        return n.includes(q) || c.includes(q) || e.includes(q);
      });
      displayMembers(filtered);
    });
  }

  // PERFIL
  async function viewMemberProfile(memberId) {
    profileCard.style.display = 'block';
    emptyProfile.style.display = 'none';

    try {
      const res = await fetch(`/api/admin/members/${memberId}`, {
        headers: { Authorization: 'Bearer ' + token }
      });
      const m = await res.json();
      console.log('PERFIL:', res.status, m);

      if (!res.ok) {
        alert(m.error || 'Error al obtener miembro');
        return;
      }

      if (m.avatar) {
        profileAvatar.src = m.avatar;
        profileAvatar.style.border = '2px solid transparent';
      } else {
        profileAvatar.src = '';
        profileAvatar.style.border = '2px solid var(--primary-color)';
      }

      profileId.textContent = m.id || '';
      profileCedula.textContent = m.cedula || '';
      profileNombre.textContent = m.nombre || '';
      profileEmail.textContent = m.email || '';
      profileTelefono.textContent = m.telefono || '';
      profilePlan.textContent = m.plan || '';
      profileFechaInicio.textContent = m.fecha_inicio || '';
      profileFechaVenc.textContent = m.fecha_vencimiento || '';
      renewSelect.value = '';
    } catch (err) {
      console.error(err);
      alert('Error al cargar el perfil.');
    }
  }

  function closeProfile() {
    profileCard.style.display = 'none';
    emptyProfile.style.display = 'block';
  }

  if (closeProfileBtn) {
    closeProfileBtn.addEventListener('click', closeProfile);
  }

  // ELIMINAR
  async function deleteMember(id) {
    const seguro = confirm('¿Seguro que querés eliminar este miembro?');
    if (!seguro) return;

    try {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await res.json();
      console.log('ELIMINAR:', res.status, data);

      if (!res.ok) {
        alert(data.error || 'No se pudo eliminar el miembro');
        return;
      }

      if (profileId.textContent === String(id)) {
        closeProfile();
      }

      fetchMembers();
    } catch (err) {
      console.error(err);
      alert('Error al conectar con el servidor.');
    }
  }

  // RENOVAR
  if (renewBtn) {
    renewBtn.addEventListener('click', async () => {
      const id = profileId.textContent;
      const plan = renewSelect.value;

      if (!id) return alert('Seleccioná un miembro.');
      if (!plan) return alert('Seleccioná un plan.');

      let days = 1;
      if (plan === 'semana') days = 7;
      if (plan === 'mes') days = 30;

      try {
        const res = await fetch('/api/admin/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          body: JSON.stringify({
            member_id: Number(id),
            amount: 0,
            extend_days: days
          })
        });

        const data = await res.json();
        console.log('RENOVAR:', res.status, data);

        if (!res.ok) {
          alert(data.error || 'Error al renovar membresía');
          return;
        }

        alert(`Membresía renovada hasta ${data.new_venc}`);
        profileFechaVenc.textContent = data.new_venc;
        fetchMembers();
      } catch (err) {
        console.error(err);
        alert('Error al conectar con el servidor.');
      }
    });
  }

  // INIT
  fetchMembers();
});
