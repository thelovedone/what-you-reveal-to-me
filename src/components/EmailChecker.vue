<script setup>
import { ref } from 'vue';
import { checkEmailOnDutchSites } from '../modules/email/checker.js';

const email = ref('');
const loading = ref(false);
const results = ref(null);
const error = ref('');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function run() {
  error.value = '';
  results.value = null;

  if (!EMAIL_RE.test(email.value.trim())) {
    error.value = 'Voer een geldig e-mailadres in.';
    return;
  }

  loading.value = true;
  try {
    const data = await checkEmailOnDutchSites(email.value.trim());
    results.value = data.results;
  } catch (e) {
    error.value = e.message || 'Onbekende fout';
  } finally {
    loading.value = false;
  }
}

function statusLabel(found) {
  if (found === true) return 'GEVONDEN';
  if (found === false) return 'NIET GEVONDEN';
  return 'ONBEKEND';
}

function statusClass(found) {
  if (found === true) return 'found';
  if (found === false) return 'not-found';
  return 'unknown';
}
</script>

<template>
  <div class="checker">
    <p class="disclaimer">
      Gebruikt alleen publieke "wachtwoord vergeten"-endpoints.
      Geen data wordt opgeslagen.
    </p>

    <form class="input-row" @submit.prevent="run">
      <span class="prompt-char">$</span>
      <input
        v-model="email"
        type="email"
        placeholder="jouw@email.nl"
        :disabled="loading"
        autocomplete="off"
        spellcheck="false"
        class="email-input"
      />
      <button type="submit" :disabled="loading" class="run-btn">
        {{ loading ? 'Bezig...' : 'Controleer' }}
      </button>
    </form>

    <p v-if="error" class="err">{{ error }}</p>

    <div v-if="loading" class="scanning">
      <span class="blink">▋</span> Scannen van Nederlandse websites...
    </div>

    <table v-if="results" class="result-table">
      <thead>
        <tr>
          <th class="col-site">Website</th>
          <th class="col-status">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in results" :key="r.site">
          <td class="col-site">{{ r.label }}</td>
          <td class="col-status" :class="statusClass(r.found)">
            {{ statusLabel(r.found) }}
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="results" class="note">
      "ONBEKEND" = site geeft geen duidelijk antwoord (privacy-bescherming of endpoint gewijzigd).
    </p>
  </div>
</template>

<style scoped>
.checker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.disclaimer {
  color: var(--fg-dim);
  font-size: var(--font-size-sm);
  margin: 0;
  border-left: 2px solid var(--border-bright);
  padding-left: 0.75ch;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 0.5ch;
  flex-wrap: wrap;
}

.prompt-char {
  color: var(--fg-muted);
  user-select: none;
}

.email-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-bright);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  outline: none;
  padding: 0.1rem 0.25rem;
  flex: 1;
  min-width: 160px;
}

.email-input::placeholder {
  color: var(--fg-muted);
}

.email-input:disabled {
  opacity: 0.5;
}

.run-btn {
  background: none;
  border: 1px solid var(--border-bright);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  padding: 0.1rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  white-space: nowrap;
}

.run-btn:hover:not(:disabled) {
  border-color: var(--fg);
}

.run-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.err {
  color: var(--warning);
  margin: 0;
  font-size: var(--font-size-sm);
}

.scanning {
  color: var(--fg-dim);
  font-size: var(--font-size-sm);
}

.blink {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.result-table th {
  text-align: left;
  color: var(--fg-muted);
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border);
  font-weight: 400;
  letter-spacing: 0.05em;
}

.result-table td {
  padding: 0.2rem 0;
  vertical-align: middle;
}

.col-site {
  color: var(--fg-dim);
  padding-right: 1ch;
}

.col-status.found {
  color: var(--warning);
}

.col-status.not-found {
  color: var(--fg-muted);
}

.col-status.unknown {
  color: var(--fg-muted);
  opacity: 0.6;
}

.note {
  color: var(--fg-muted);
  font-size: var(--font-size-sm);
  margin: 0;
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
}
</style>
