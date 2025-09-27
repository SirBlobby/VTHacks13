"use client";

import React from 'react';

export default function Legend() {
	return (
		<div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 12 }}>
			<div style={{ background: 'var(--background)', color: 'var(--foreground)', padding: 8, borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.06)', fontSize: 12 }}>
				<div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Density legend</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
						<div style={{ width: 18, height: 12, background: 'rgba(0,120,48,0.0)', border: '1px solid rgba(0,0,0,0.06)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(34,139,34,0.8)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(154,205,50,0.9)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(255,215,0,0.95)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(255,140,0,0.95)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(215,25,28,1)' }} />
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
						<span style={{ fontSize: 11 }}>Low</span>
						<span style={{ fontSize: 11, fontWeight: 700 }}>High</span>
					</div>
				</div>
			</div>
		</div>
	);
}
