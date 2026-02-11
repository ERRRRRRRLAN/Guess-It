import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const topScores = await prisma.score.findMany({
            orderBy: {
                attempts: 'asc'
            },
            take: 5
        });
        return NextResponse.json(topScores);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch scores' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, attempts, difficulty } = body;

        const newScore = await prisma.score.create({
            data: {
                name,
                attempts,
                difficulty
            }
        });

        return NextResponse.json(newScore);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
    }
}
