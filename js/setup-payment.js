(function () {
  var params = new URLSearchParams(window.location.search);
  var name = document.getElementById('name');
  var email = document.getElementById('email');
  if (name && params.get('name')) name.value = params.get('name');
  if (email && params.get('email')) email.value = params.get('email');
})();
