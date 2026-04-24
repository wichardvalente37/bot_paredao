import pyautogui as auto
import time

for i in range(50):
    auto.click()
    auto.write('Pitito, Lurdes sabe?')
    auto.press('enter')
    time.sleep(0.5)
   