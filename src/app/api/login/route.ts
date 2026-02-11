import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        // Basic logic for now as requested
        if (username && password) {
            return NextResponse.json({ success: true, user: username });
        }

        return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    } catch (error) {
        return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
    }
}
