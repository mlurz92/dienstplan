import { defaults, getOrDefault, invalid, json, normalizeSettings, put, readJsonRequest, serverError } from '../_utils.js';
import { isPlainRecord } from '../../js/defaults.js';

export async function onRequestGet(context) {
  try {
    const value = normalizeSettings(await getOrDefault(context, 'app:settings', defaults().settings));
    return json({ ok: true, settings: value });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPut(context) {
  let raw;
  try { raw = await readJsonRequest(context.request); }
  catch (error) { return invalid(error.message); }
  // Manche Clients wickeln die Einstellungen in { settings: … } ein; das ist
  // hier wie bei rbn-names zulässig. Eine unbekannte oder leere Hülle darf aber
  // niemals stillschweigend auf die Vorgaben zurückgesetzt werden.
  const body = isPlainRecord(raw) && raw.settings !== undefined ? raw.settings : raw;
  if (!isPlainRecord(body)) return invalid('„settings“ muss ein JSON-Objekt sein.');
  if (!['appearance', 'workflow', 'autoPlan'].some(key => key in body)) {
    return invalid('„settings“ enthält keine bekannte Gruppe (appearance, workflow, autoPlan).');
  }
  let payload;
  try { payload = normalizeSettings(body, { strict: true }); }
  catch (error) { return invalid(error.message); }
  try {
    await put(context, 'app:settings', payload);
    return json({ ok: true, settings: payload });
  } catch (error) {
    return serverError(error);
  }
}
