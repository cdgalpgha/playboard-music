import {test,expect} from '@playwright/test';
test('piano shortcuts produce the correct chord intervals',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#piano')).toBeVisible();await page.keyboard.press('d');await expect(page.locator('#current-chord')).toHaveText('D');
 await page.keyboard.down('Shift');await page.keyboard.down('d');await expect(page.locator('#current-chord')).toHaveText('D minor');
 await expect(page.locator('[data-midi="62"]')).toHaveClass(/pressed/);await expect(page.locator('[data-midi="65"]')).toHaveClass(/pressed/);await expect(page.locator('[data-midi="69"]')).toHaveClass(/pressed/);
 await page.keyboard.up('d');await page.keyboard.up('Shift');await page.keyboard.down('Space');await page.keyboard.down('d');await expect(page.locator('#current-chord')).toHaveText('D♯');
 await expect(page.locator('[data-midi="63"]')).toHaveClass(/pressed/);await expect(page.locator('[data-midi="67"]')).toHaveClass(/pressed/);await expect(page.locator('[data-midi="70"]')).toHaveClass(/pressed/);
 await page.keyboard.up('d');await page.keyboard.up('Space');expect(errors).toEqual([]);
});
test('genre practice advances and progress persists',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Jazz',exact:true}).click();await expect(page.locator('.progression-card').first()).toContainText('Dm');
 await page.locator('#bpm').fill('180');await page.locator('#bpm').blur();await page.locator('#practice-toggle').click();await expect(page.locator('#practice-toggle')).toContainText('Pause');
 await expect(page.locator('.progression-card').nth(1)).toHaveClass(/current/,{timeout:4000});
 await page.keyboard.press('g');await page.getByRole('button',{name:'My progress',exact:false}).click();await expect(page.locator('.stat').nth(0)).toContainText('1');await expect(page.locator('.stat').nth(1)).toContainText('1');await page.reload();await page.getByRole('button',{name:'My progress',exact:false}).click();await expect(page.locator('.stat').nth(0)).toContainText('1');
});
test('chord book search, lessons, recording, and library controls work',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Chord book',exact:false}).click();await expect(page.locator('.book-chord')).toHaveCount(24);await page.locator('#chord-search').fill('D minor');await expect(page.locator('.book-chord')).toHaveCount(1);await page.locator('.book-chord').click();await expect(page.locator('.book-chord')).toHaveClass(/is-playing/);
 await page.getByRole('button',{name:'Learn to play',exact:false}).click();await page.locator('#next-lesson').click();await page.keyboard.press('Shift+d');await expect(page.locator('#lesson-feedback')).toHaveText('Lovely. That’s your chord!');
 await page.getByRole('button',{name:'Play studio',exact:false}).click();await page.locator('#record').click();await page.keyboard.press('c');await page.keyboard.press('g');await page.locator('#record').click();await expect(page.locator('.record-result')).toContainText('2 chords recorded');await page.locator('#replay').click();
 await page.getByRole('button',{name:'Song library',exact:false}).click();await page.getByRole('button',{name:'Pakistani',exact:true}).click();await expect(page.locator('.song-card')).toHaveCount(1);await page.locator('#karaoke-play').click();await expect(page.locator('#toast')).toHaveText('Open an audio file first.');
 await page.locator('#lyrics-file').setInputFiles({name:'test.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]Hello music\n[00:02.00]Keep playing')});await expect(page.locator('#toast')).toHaveText('2 timed lyric lines loaded');
});
test('desktop layout and narrower screen render without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:1440,height:1100});await page.goto('/');await page.screenshot({path:'/tmp/playboard-desktop.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('keyboard creates an audible Web Audio signal',async({page})=>{
 await page.addInitScript(()=>{const Base=window.AudioContext;window.oscillators=[];window.AudioContext=class extends Base{constructor(...args){super(...args);window.testAudio=this}createGain(){const g=super.createGain();if(!window.testMaster)window.testMaster=g;return g}createOscillator(){const o=super.createOscillator();window.oscillators.push(o);return o}}});
 await page.goto('/');await expect(page.locator('#piano')).toBeVisible();await page.keyboard.press('d');
 await expect.poll(()=>page.evaluate(()=>window.testAudio?.state)).toBe('running');
 const frequency=await page.evaluate(()=>window.oscillators[0].frequency.value);expect(frequency).toBeCloseTo(293.6648,2);
 await page.evaluate(()=>{window.testAnalyser=window.testAudio.createAnalyser();window.testMaster.connect(window.testAnalyser)});
 await expect.poll(()=>page.evaluate(()=>{const values=new Float32Array(window.testAnalyser.fftSize);window.testAnalyser.getFloatTimeDomainData(values);return Math.max(...values.map(Math.abs))})).toBeGreaterThan(.001);
});
test('local audio plays and lyrics follow seeking',async({page})=>{
 const rate=22050,seconds=4,dataSize=rate*seconds*2;const wav=Buffer.alloc(44+dataSize);wav.write('RIFF');wav.writeUInt32LE(36+dataSize,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(dataSize,40);for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*Math.PI*2*440)*1000),44+i*2);
 await page.goto('/');await page.getByRole('button',{name:'Song library',exact:false}).click();await page.locator('#karaoke-file').setInputFiles({name:'practice.wav',mimeType:'audio/wav',buffer:wav});await page.locator('#lyrics-file').setInputFiles({name:'practice.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]First line\n[00:02.00]Second line')});await expect(page.locator('#toast')).toHaveText('2 timed lyric lines loaded');await page.locator('#karaoke-play').click();await expect(page.locator('#karaoke-lyric')).toHaveText('First line');await page.locator('#karaoke-seek').evaluate(el=>{el.value='2.5';el.dispatchEvent(new Event('input',{bubbles:true}))});await expect(page.locator('#karaoke-lyric')).toHaveText('Second line');await page.locator('#karaoke-play').click();await expect(page.locator('#karaoke-play')).toHaveText('▶ Play track');
});
