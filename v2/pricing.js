/* Hover, keyboard focus, and touch share a dismissible feature tooltip. */
const pricingFeatures = [...document.querySelectorAll('.pricing-feature')];
function setPricingTooltip(feature, open) {
  feature.classList.toggle('is-open', open);
  feature.querySelector('button').setAttribute('aria-expanded', String(open));
}
function closePricingTooltips(except) {
  pricingFeatures.forEach(feature => {
    if (feature !== except) setPricingTooltip(feature, false);
  });
}
pricingFeatures.forEach(feature => {
  const trigger = feature.querySelector('button');
  let openBeforePointer = false;
  const show = () => { closePricingTooltips(feature); setPricingTooltip(feature, true); };
  feature.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(); });
  feature.addEventListener('pointerleave', () => { if (!feature.contains(document.activeElement)) setPricingTooltip(feature, false); });
  trigger.addEventListener('pointerdown', () => { openBeforePointer = feature.classList.contains('is-open'); });
  trigger.addEventListener('focus', show);
  trigger.addEventListener('click', event => {
    const open = event.detail === 0 ? !feature.classList.contains('is-open') : !openBeforePointer;
    closePricingTooltips(feature);
    setPricingTooltip(feature, open);
  });
  feature.addEventListener('focusout', event => { if (!feature.contains(event.relatedTarget)) setPricingTooltip(feature, false); });
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePricingTooltips(); });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.pricing-feature')) closePricingTooltips(); });
