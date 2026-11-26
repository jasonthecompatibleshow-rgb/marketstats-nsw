/* About page contact form -> Supabase public.contact_messages (insert-only), or a demo note when not configured. */
(() => {
  const $ = (id) => document.getElementById(id);
  MSAuth.wireForm($('contactForm'), { table: 'contact_messages', msg: $('cfOut'), ok: 'Message sent. We\'ll reply by email.', demo: 'Demo mode: this form doesn\'t send anything yet.',
    row: () => {
      const name = $('cfName').value.trim(), email = $('cfEmail').value.trim(), message = $('cfMsg').value.trim();
      if (!name) return 'Please add your name.'; if (!MSAuth.validEmail(email)) return 'Enter a valid email address.'; if (message.length < 5) return 'Please write a short message.';
      return { name: name.slice(0, 100), email, message: message.slice(0, 4000) };
    } });
})();
