// Flashcards Test question nav at /flashcards-test-nav-dev?n=49&bar=0|1, for mockup screenshots.
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Layers3 } from 'lucide-react';
import type { FlashcardCard } from '@/types';
import { LocalFlashcardAdapter } from '@/components/flashcards/adapters';
import { FlashcardPlayer } from '@/components/flashcards/FlashcardPlayer';

const WORDS: Array<[string, string]> = [
  ['la playa', 'the beach'],
  ['el bosque', 'the forest'],
  ['la montaña', 'the mountain'],
  ['el río', 'the river'],
  ['el lago', 'the lake'],
  ['la isla', 'the island'],
  ['el desierto', 'the desert'],
  ['la selva', 'the jungle'],
  ['el valle', 'the valley'],
  ['la costa', 'the coast'],
  ['el volcán', 'the volcano'],
  ['la cueva', 'the cave'],
  ['el campo', 'the countryside'],
  ['la ciudad', 'the city'],
  ['el pueblo', 'the town'],
  ['la granja', 'the farm'],
  ['el puente', 'the bridge'],
  ['la carretera', 'the highway'],
  ['el mapa', 'the map'],
  ['la brújula', 'the compass'],
  ['la tienda de campaña', 'the tent'],
  ['el saco de dormir', 'the sleeping bag'],
  ['la mochila', 'the backpack'],
  ['la linterna', 'the flashlight'],
  ['el fuego', 'the fire'],
  ['la leña', 'the firewood'],
  ['el sendero', 'the trail'],
  ['la cascada', 'the waterfall'],
  ['el árbol', 'the tree'],
  ['la flor', 'the flower'],
  ['la hoja', 'the leaf'],
  ['la piedra', 'the stone'],
  ['la arena', 'the sand'],
  ['la ola', 'the wave'],
  ['el cielo', 'the sky'],
  ['la nube', 'the cloud'],
  ['la estrella', 'the star'],
  ['la luna', 'the moon'],
  ['el sol', 'the sun'],
  ['la lluvia', 'the rain'],
  ['la nieve', 'the snow'],
  ['el viento', 'the wind'],
  ['la tormenta', 'the storm'],
  ['el relámpago', 'the lightning'],
  ['el trueno', 'the thunder'],
  ['el arcoíris', 'the rainbow'],
  ['la niebla', 'the fog'],
  ['el hielo', 'the ice'],
  ['la hierba', 'the grass'],
  ['el pájaro', 'the bird'],
  ['el pez', 'the fish'],
  ['la rana', 'the frog'],
  ['el oso', 'the bear'],
  ['el lobo', 'the wolf'],
  ['el zorro', 'the fox'],
  ['el ciervo', 'the deer'],
  ['la ardilla', 'the squirrel'],
  ['el águila', 'the eagle'],
  ['la serpiente', 'the snake'],
  ['la tortuga', 'the turtle'],
];

const params = new URLSearchParams(window.location.search);
const count = Math.max(
  4,
  Math.min(WORDS.length, Number(params.get('n')) || 16)
);
const bar = params.get('bar') !== '0';
const answeredCount = Number(params.get('answered')) || 0;

export const FlashcardsTestNavDevHarness: React.FC = () => {
  const cards = useMemo<FlashcardCard[]>(
    () =>
      WORDS.slice(0, count).map(([term, definition], index) => ({
        id: `card-${index}`,
        term,
        definition,
      })),
    []
  );
  const [adapter] = useState(
    () =>
      new LocalFlashcardAdapter(`test-nav-dev-${count}-${bar}-${Date.now()}`)
  );
  const initialAnswers = useMemo(
    () =>
      Object.fromEntries(
        cards
          .filter((_, index) => index % 3 !== 2)
          .slice(0, answeredCount)
          .map((card) => [card.id, card.definition])
      ),
    [cards]
  );
  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-xs sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="rounded-full bg-slate-100 p-2 text-slate-700">
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <Layers3 aria-hidden="true" className="h-5 w-5" />
          </span>
          <h1 className="min-w-0 truncate text-lg font-black text-slate-900 sm:text-xl">
            {count > 20
              ? 'OLSp.III U4.2 Vocabulario'
              : 'Biology: cell structures'}
          </h1>
          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            Check
          </span>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <div className="relative h-full">
          <FlashcardPlayer
            cards={cards}
            termLanguage="es-MX"
            definitionLanguage="en-US"
            adapter={adapter}
            seed="test-nav-dev"
            testQuestionBar={bar}
            initialSettings={{ testTypes: ['mc', 'fib'] }}
            check={{
              mode: 'test',
              initialCheckLog: Object.fromEntries(
                Object.entries(initialAnswers).map(([cardId, response]) => [
                  cardId,
                  { response, attempts: 0, done: false },
                ])
              ),
              submitting: false,
              error: null,
              onCheckWrite: () => undefined,
              onSubmit: () => undefined,
            }}
          />
        </div>
      </main>
    </div>
  );
};
