// ===== Autenticazione =====
// Fa da "gate": l'app è visibile solo con una sessione attiva.
// Metodi: accesso con password e registrazione (con conferma + requisiti).
// (Login con codice OTP via email: rinviato alla Fase 4, richiede un SMTP.)

// --- Elementi ---
const authSub   = document.getElementById('authSub');
const authError = document.getElementById('authError');
const authMsg   = document.getElementById('authMsg');

const loginForm    = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const loginEmail    = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const regEmail      = document.getElementById('regEmail');
const regPassword   = document.getElementById('regPassword');
const regPassword2  = document.getElementById('regPassword2');

const logoutBtn = document.getElementById('logoutBtn');
const userInfo  = document.getElementById('userInfo');

// --- Avvio app (una sola volta) ---
let appStarted = false;
function startAppOnce(){
  if(appStarted) return;
  appStarted = true;
  if(typeof window.initApp === 'function') window.initApp();
}

// --- Messaggi ---
function showError(text){ authError.textContent = text; authError.style.display='block'; authMsg.style.display='none'; }
function showMsg(text){ authMsg.textContent = text; authMsg.style.display='block'; authError.style.display='none'; }
function clearMessages(){ authError.style.display='none'; authMsg.style.display='none'; }

// --- Modalità della schermata (login / register) ---
const SUBTITLES = {
  login:    'Sign in to continue',
  register: 'Create your account'
};
function setMode(mode){
  clearMessages();
  loginForm.style.display    = (mode==='login')    ? '' : 'none';
  registerForm.style.display = (mode==='register') ? '' : 'none';
  authSub.textContent = SUBTITLES[mode] || '';
}

// --- Gate ---
function enterApp(session){
  if(userInfo) userInfo.textContent = session?.user?.email || '';
  document.body.classList.add('authed');
  startAppOnce();
}
function exitToAuth(){
  document.body.classList.remove('authed');
}

// --- Validazione password ---
function passwordProblem(pw, pw2){
  if(pw.length < 8) return 'Password must be at least 8 characters.';
  if(!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
  if(pw !== pw2) return 'The two passwords do not match.';
  return null;
}

// --- Navigazione tra le modalità ---
document.getElementById('toRegister').addEventListener('click', e=>{ e.preventDefault(); setMode('register'); });
document.getElementById('toLoginFromReg').addEventListener('click', e=>{ e.preventDefault(); setMode('login'); });

// --- Accesso con password ---
loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearMessages();
  const { error } = await sb.auth.signInWithPassword({
    email: loginEmail.value.trim(),
    password: loginPassword.value
  });
  if(error){ showError(error.message); return; }
  // onAuthStateChange entra nell'app
});

// --- Registrazione ---
registerForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearMessages();
  const problem = passwordProblem(regPassword.value, regPassword2.value);
  if(problem){ showError(problem); return; }
  const { data, error } = await sb.auth.signUp({
    email: regEmail.value.trim(),
    password: regPassword.value
  });
  if(error){ showError(error.message); return; }
  if(data.session){
    // "Confirm email" disabilitato: utente già loggato → onAuthStateChange entra
  } else {
    setMode('login');
    showMsg('Account created. Check your email to confirm, then sign in.');
  }
});

// --- Logout ---
if(logoutBtn){
  logoutBtn.addEventListener('click', async (e)=>{
    e.preventDefault();
    await storage.flushNow();           // invia eventuali salvataggi in coda
    await sb.auth.signOut();
    location.reload();                  // stato pulito: il prossimo utente ricarica dal cloud
  });
}

// --- Reagisce ai cambi di stato (login/logout/refresh token) ---
sb.auth.onAuthStateChange((_event, session)=>{
  if(session){ enterApp(session); } else { exitToAuth(); }
});

// --- Controllo iniziale della sessione ---
(async ()=>{
  const { data:{ session } } = await sb.auth.getSession();
  if(session){ enterApp(session); } else { setMode('login'); exitToAuth(); }
})();
