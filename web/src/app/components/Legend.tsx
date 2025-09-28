"use client";

import React from 'react';

export default function Legend() {
	return (
		<div style={{ position: 'absolute', bottom: '580px', right: '12px', zIndex: 30 }}>
			<div style={{ 
				backgroundColor: 'var(--panel-darker)', 
				color: 'white', 
				padding: '12px', 
				borderRadius: '10px', 
				boxShadow: '0 6px 18px rgba(0,0,0,0.15)', 
				border: '1px solid var(--panel-medium)', 
				fontSize: '13px',
				width: '240px',
				backdropFilter: 'blur(8px)'
			}}>
				<div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Crash Density</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
						<div style={{ width: 18, height: 12, background: 'rgba(0,0,0,0)', border: '1px solid rgba(128, 128, 128, 0.5)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(255,255,0,0.7)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(255,165,0,0.8)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(255,69,0,0.9)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(255,0,0,0.95)' }} />
						<div style={{ width: 18, height: 12, background: 'rgba(139,0,0,1)' }} />
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
						<span style={{ fontSize: 11, color: '#ccc' }}>Low</span>
						<span style={{ fontSize: 11, fontWeight: 700, color: '#ccc' }}>High</span>
					</div>
				</div>
				<div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(64, 64, 64, 0.5)' }}>
					<div style={{ fontSize: 11, color: '#9ca3af' }}>
						Real DC crash data (2020+)
					</div>
				</div>
			</div>
		</div>
	);
}
