// ===== Autenticazione (Fase 2) =====
// Gestisce login / registrazione / logout e fa da "gate": l'app (header, tabella,
// mobilebar) è visibile solo con una sessione attiva. I dati restano ancora in
// localStorage (la persistenza cloud arriva in Fase 3).

const authScreen   = document.getElementById('authScreen');
const authForm     = document.getElementById('authForm');
const authEmail    = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError    = document.getElementById('authError');
const authMsg      = document.getElementById('authMsg');
const signupBtn    = document.getElementById('signupBtn');
const logoutBtn    = document.getElementById('logoutBtn');
const userInfo     = document.getElementById('userInfo');

let appStarted = false;
function startAppOnce(){
  if(appStarted) return;
  appStarted = true;
  if(typeof window.initApp === 'function') window.initApp();
}

function showError(text){ authError.textContent = text; authError.style.display='block'; authMsg.style.display='none'; }
function showMsg(text){ authMsg.textContent = text; authMsg.style.display='block'; authError.style.display='none'; }
function clearMessages(){ authError.style.display='none'; authMsg.style.display='none'; }

function enterApp(session){
  if(userInfo) userInfo.textContent = session?.user?.email || '';
  document.body.classList.add('authed');
  startAppOnce();
}
function exitToAuth(){
  document.body.classList.remove('authed');
}

// Login (submit del form)
authForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearMessages();
  const { error } = await sb.auth.signInWithPassword({
    email: authEmail.value.trim(),
    password: authPassword.value
  });
  if(error){ showError(error.message); return; }
  // onAuthStateChange gestisce l'ingresso nell'app
});

// Registrazione
signupBtn.addEventListener('click', async ()=>{
  clearMessages();
  if(!authEmail.value.trim() || !authPassword.value){ showError('Inserisci email e password.'); return; }
  const { data, error } = await sb.auth.signUp({
    email: authEmail.value.trim(),
    password: authPassword.value
  });
  if(error){ showError(error.message); return; }
  if(data.session){
    // "Confirm email" disabilitato: utente già loggato → onAuthStateChange entra nell'app
  } else {
    showMsg('Registrazione effettuata. Controlla la tua email per confermare, poi accedi.');
  }
});

// Logout
if(logoutBtn){
  logoutBtn.addEventListener('click', async (e)=>{
    e.preventDefault();
    await storage.flushNow();           // invia eventuali salvataggi in coda
    await sb.auth.signOut();
    location.reload();                  // stato pulito: il prossimo utente ricarica dal cloud
  });
}

// Reagisce ai cambi di stato (login/logout/refresh token)
sb.auth.onAuthStateChange((_event, session)=>{
  if(session){ enterApp(session); } else { exitToAuth(); }
});

// Controllo iniziale della sessione al caricamento
(async ()=>{
  const { data:{ session } } = await sb.auth.getSession();
  if(session){ enterApp(session); } else { exitToAuth(); }
})();
