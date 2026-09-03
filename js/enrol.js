(function () {
  var form = document.getElementById('enrol-form');
  if (!form) return;

  var next = form.querySelector('[name="_next"]');
  if (next) {
    next.value = new URL('thanks.html', window.location.href).href;
  }

  var allowed = {
    primary: 'Primary School',
    'high-school': 'High School',
    hsc: 'HSC'
  };
  var plan = new URLSearchParams(window.location.search).get('plan');
  var planInput = document.getElementById('plan');
  var planNote = document.getElementById('plan-note');
  if (plan && allowed[plan] && planInput) {
    planInput.value = allowed[plan];
    if (planNote) {
      planNote.hidden = false;
      planNote.textContent = 'Booking a ' + allowed[plan] + ' free trial.';
    }
  }
})();
