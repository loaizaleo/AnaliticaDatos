# Readme<br>
## Función de Conversión de tipo de dato python
En un archivo .txt raw se tiene
una serie de datos del tipo
**object** en desorden.
Para identificar aquellos elementos 
correspondientes a entero **int**,
y cambiar el valor de todos los
demás a 0 se define la siguiente
función:<br>
```
import pandas as pd
import numpy as np

def convertir_elemento(elemento):
#Convierte un elemento individual
    if pd.isna(elemento):  # Manejar valores nulos
        return 0
    
    elemento_str = str(elemento).strip()
    
    # Verificar si es número (incluyendo negativos)
    if elemento_str.lstrip('-').isdigit() and elemento_str not in ['', '-']:
        return int(elemento_str)
    else:
        return 0
``` 
El código comienza con la función
pandas **pd.isna()**