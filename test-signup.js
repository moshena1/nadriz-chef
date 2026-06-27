async function testSignup() {
  const username = 'testuser' + Date.now();
  const email = `test${Date.now()}@example.com`;
  const password = 'testpass123';

  console.log('🧪 Testing signup with:', { username, email, password });

  try {
    const res = await fetch('http://localhost:3001/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response:', data);

    if (res.ok) {
      console.log('✅ Signup successful!');
      console.log('User ID:', data.id);
      console.log('Verification Code:', data.verificationCode);
    } else {
      console.log('❌ Signup failed:', data.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSignup();
