// Bind only explicitly marked read-only JSON views.
document.querySelectorAll('[data-json-inspect]').forEach(button => {
  button.addEventListener('click', () => {
    const source = document.getElementById(button.dataset.jsonInspect);
    try { EdwardcherJSONInspector.open(JSON.parse(source.textContent), button.dataset.jsonTitle); }
    catch { EdwardcherJSONInspector.open({status:'No valid JSON available yet. Run a test or collect a sample.'}, button.dataset.jsonTitle); }
  });
});
