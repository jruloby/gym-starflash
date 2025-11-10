// public/js/member.js

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token || role !== 'member') {
    window.location.href = '/';
    return;
  }

  // ELEMENTOS
  const logoutBtn = document.getElementById('member-logout-btn');

  const nameEl = document.getElementById('member-name');
  const planEl = document.getElementById('member-plan');
  const vencEl = document.getElementById('member-vencimiento');
  const daysLeftEl = document.getElementById('member-days-left');
  const statusMsgEl = document.getElementById('member-status-msg');

  const avatarImg = document.getElementById('member-avatar');
  const changeAvatarBtn = document.getElementById('change-avatar-btn');
  const avatarInput = document.getElementById('avatar-input');

  const favMachinesEl = document.getElementById('fav-machines');
  const goalsEl = document.getElementById('goals');
  const saveProfileBtn = document.getElementById('save-profile-btn');
  const profileMsg = document.getElementById('profile-msg');

  const weeklyForm = document.getElementById('weekly-routine-form');
  const routineMsg = document.getElementById('routine-msg');
  const workoutsList = document.getElementById('workouts-list');

  const fields = {
    0: document.getElementById('rutina-dom'),
    1: document.getElementById('rutina-lun'),
    2: document.getElementById('rutina-mar'),
    3: document.getElementById('rutina-mie'),
    4: document.getElementById('rutina-jue'),
    5: document.getElementById('rutina-vie'),
    6: document.getElementById('rutina-sab')
  };

  let pendingAvatarFile = null;

  // LOGOUT
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = '/';
    });
  }

  // CAMBIAR FOTO (abrir input)
  if (changeAvatarBtn && avatarInput) {
    changeAvatarBtn.addEventListener('click', () => {
      avatarInput.click();
    });

    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files[0];
      if (!file) return;
      pendingAvatarFile = file;

      // Preview local instantáneo
      const reader = new FileReader();
      reader.onload = (e) => {
        if (avatarImg) avatarImg.src = e.target.result;
      };
      reader.readAsDataURL(file);

      if (profileMsg) {
        profileMsg.textContent = 'Nueva foto seleccionada. Guardá el perfil para aplicar.';
        profileMsg.className = 'routine-msg';
      }
    });
  }

  // CARGAR INFO MIEMBRO
  async function fetchMemberInfo() {
    try {
      const res = await fetch('/api/member/me', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await res.json();

      if (!res.ok) {
        console.error('member/me error:', data);
        alert(data.error || 'Error al cargar tus datos.');
        return;
      }

      nameEl.textContent = data.nombre || '';
      planEl.textContent = data.plan || 'Sin plan';
      vencEl.textContent = data.fecha_vencimiento || 'Sin fecha';

      // Avatar
      if (data.avatar) {
        avatarImg.src = data.avatar;
      } else {
        avatarImg.src = 'https://via.placeholder.com/80?text=USER';
      }

      // Preferencias
      if (favMachinesEl) favMachinesEl.value = data.fav_machines || '';
      if (goalsEl) goalsEl.value = data.goals || '';

      // Días restantes
      const dias = data.dias_restantes;
      if (dias == null) {
        daysLeftEl.textContent = 'Sin info de vencimiento';
        daysLeftEl.className = 'days-left-pill days-unknown';
        statusMsgEl.textContent = '';
      } else {
        let txt = `${dias} días restantes`;
        let cls = 'days-left-pill ';
        if (dias < 0) {
          txt = 'Suscripción vencida';
          cls += 'days-expired';
          statusMsgEl.textContent =
            'Tu suscripción está vencida. Consultá para renovarla.';
        } else if (dias === 0) {
          txt = 'Último día';
          cls += 'days-warning';
          statusMsgEl.textContent =
            'Hoy es tu último día de suscripción.';
        } else if (dias <= 5) {
          cls += 'days-warning';
          statusMsgEl.textContent =
            `Tu suscripción vence en ${dias} día(s).`;
        } else {
          cls += 'days-ok';
          statusMsgEl.textContent = 'Tu suscripción está activa.';
        }
        daysLeftEl.textContent = txt;
        daysLeftEl.className = cls;
      }
    } catch (err) {
      console.error(err);
      alert('No se pudo cargar la información del miembro.');
    }
  }

  // GUARDAR PERFIL (foto + preferencias)
  async function saveProfile() {
    if (profileMsg) {
      profileMsg.textContent = '';
      profileMsg.className = 'routine-msg';
    }

    try {
      const formData = new FormData();
      if (favMachinesEl) formData.append('fav_machines', favMachinesEl.value.trim());
      if (goalsEl) formData.append('goals', goalsEl.value.trim());
      if (pendingAvatarFile) formData.append('avatar', pendingAvatarFile);

      const res = await fetch('/api/member/profile', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token
          // NO seteamos Content-Type, FormData lo maneja
        },
        body: formData
      });

      const data = await res.json();
      console.log('PROFILE UPDATE:', res.status, data);

      if (!res.ok) {
        if (profileMsg) {
          profileMsg.textContent = data.error || 'No se pudo actualizar el perfil.';
          profileMsg.classList.add('error-msg');
        }
        return;
      }

      // Actualizar vista con datos devueltos
      if (data.avatar && avatarImg) {
        avatarImg.src = data.avatar;
      }
      pendingAvatarFile = null;

      if (profileMsg) {
        profileMsg.textContent = 'Perfil actualizado correctamente.';
        profileMsg.classList.add('success-msg');
      }

      // Opcional: refrescar días restantes / vencimiento por si cambió algo
      if (typeof data.dias_restantes !== 'undefined') {
        // sin romper nada, podemos dejarlo o llamar fetchMemberInfo()
        fetchMemberInfo();
      }
    } catch (err) {
      console.error(err);
      if (profileMsg) {
        profileMsg.textContent = 'Error al conectar con el servidor.';
        profileMsg.classList.add('error-msg');
      }
    }
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => {
      saveProfile();
    });
  }

  // CARGAR PLANTILLAS RUTINA
  async function loadTemplates() {
    try {
      const res = await fetch('/api/member/routines-template', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await res.json();

      if (!res.ok) {
        console.error('routines-template error:', data);
        return;
      }

      Object.values(fields).forEach((f) => {
        if (f) f.value = '';
      });

      (data.templates || []).forEach((t) => {
        const f = fields[t.day_of_week];
        if (f) {
          const text =
            [t.titulo, t.descripcion].filter(Boolean).join(' - ');
          f.value = text;
        }
      });
    } catch (err) {
      console.error(err);
    }
  }

  // GUARDAR PLANTILLAS RUTINA
  async function saveTemplates() {
    if (routineMsg) {
      routineMsg.textContent = '';
      routineMsg.className = 'routine-msg';
    }

    try {
      for (const [dowStr, f] of Object.entries(fields)) {
        const day_of_week = parseInt(dowStr, 10);
        if (!f) continue;

        const text = f.value.trim();
        let titulo = '';
        let descripcion = '';

        if (text) {
          titulo = 'Rutina';
          descripcion = text;
        }

        const body = { day_of_week, titulo, descripcion };

        const res = await fetch('/api/member/routines-template', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          body: JSON.stringify(body)
        });

        const data = await res.json();
        if (!res.ok) {
          console.error('Error guardando día', day_of_week, data);
          if (routineMsg) {
            routineMsg.textContent =
              'Error al guardar alguna de las rutinas.';
            routineMsg.classList.add('error-msg');
          }
          return;
        }
      }

      if (routineMsg) {
        routineMsg.textContent = 'Rutina semanal guardada.';
        routineMsg.classList.add('success-msg');
      }

      await fetchWorkoutsWeek();
    } catch (err) {
      console.error(err);
      if (routineMsg) {
        routineMsg.textContent = 'Error al conectar con el servidor.';
        routineMsg.classList.add('error-msg');
      }
    }
  }

  if (weeklyForm) {
    weeklyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveTemplates();
    });
  }

  // VER RUTINAS SEMANA
  async function fetchWorkoutsWeek() {
    if (!workoutsList) return;
    workoutsList.innerHTML = '<p class="muted">Cargando...</p>';

    try {
      const res = await fetch('/api/member/workouts/week', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await res.json();

      if (!res.ok) {
        console.error('workouts/week error:', data);
        workoutsList.innerHTML =
          '<p class="error-msg">Error al cargar tus rutinas.</p>';
        return;
      }

      const workouts = data.workouts || [];
      if (!workouts.length) {
        workoutsList.innerHTML =
          '<p class="muted">No tenés rutinas definidas aún. Guardá tu rutina semanal arriba.</p>';
        return;
      }

      workoutsList.innerHTML = '';
      workouts.forEach((w) => {
        const item = document.createElement('div');
        item.className = 'workout-item';
        item.innerHTML = `
          <h4>${w.fecha} - ${w.titulo || 'Rutina'}</h4>
          <p>${w.descripcion || ''}</p>
        `;
        workoutsList.appendChild(item);
      });
    } catch (err) {
      console.error(err);
      workoutsList.innerHTML =
        '<p class="error-msg">Error al conectar con el servidor.</p>';
    }
  }

  // INIT
  fetchMemberInfo();
  loadTemplates().then(fetchWorkoutsWeek);
});
