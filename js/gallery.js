const gallery = document.querySelector('.gallery');
if (gallery) {
  var fragment = document.createDocumentFragment();
  var kids = Array.prototype.slice.call(gallery.children);
  for (var i = 0; i < kids.length; i++) {
    var clone = kids[i].cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    var imgs = clone.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
      imgs[j].setAttribute('alt', '');
      imgs[j].setAttribute('loading', 'lazy');
      imgs[j].setAttribute('decoding', 'async');
    }
    var headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (var h = 0; h < headings.length; h++) {
      var el = headings[h];
      var p = document.createElement('p');
      p.className = el.className;
      p.textContent = el.textContent;
      el.replaceWith(p);
    }
    fragment.appendChild(clone);
  }
  gallery.appendChild(fragment);
}
